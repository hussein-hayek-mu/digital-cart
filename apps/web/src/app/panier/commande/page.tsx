"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useCart } from "@/components/cart-provider";
import {
  ApiError,
  createCheckoutSession,
  validateCart,
  type CartValidateResult,
} from "@/lib/api";
import { PhoneInput } from "@/components/phone-input";
import { getProfile } from "@/lib/auth-api";
import { formatXOF } from "@/lib/format";
import { saveOrderAccessToken } from "@/lib/order-access";
import { CI_PHONE_ERROR, ciLocalToE164, isCiE164, isValidCiLocal, toCiLocalDigits } from "@/lib/phone";

export default function CommandePage() {
  const router = useRouter();
  const { items, isReady } = useCart();
  const { user, accessToken, isLoading: authLoading } = useAuth();

  const [validation, setValidation] = useState<CartValidateResult | null>(null);
  const [validateStatus, setValidateStatus] = useState<"idle" | "loading" | "error">("idle");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    if (items.length === 0) {
      router.replace("/panier");
      return;
    }

    let cancelled = false;
    setValidateStatus("loading");
    validateCart(items.map((i) => ({ productPublicId: i.productPublicId, quantity: i.quantity })))
      .then((result) => {
        if (!cancelled) {
          setValidation(result);
          setValidateStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setValidateStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [items, isReady, router]);

  useEffect(() => {
    if (authLoading || profileLoaded) return;

    if (user?.email) {
      setEmail((prev) => prev || user.email || "");
    }
    const metaName = user?.user_metadata?.full_name;
    if (typeof metaName === "string" && metaName.trim()) {
      setFullName((prev) => prev || metaName.trim());
    }

    if (!accessToken) {
      setProfileLoaded(true);
      return;
    }

    let cancelled = false;
    getProfile(accessToken)
      .then((profile) => {
        if (cancelled) return;
        if (profile.fullName) setFullName((prev) => prev || profile.fullName || "");
        if (profile.email) setEmail((prev) => prev || profile.email || "");
        if (isCiE164(profile.phoneE164)) {
          setPhone((prev) => prev || toCiLocalDigits(profile.phoneE164));
        }
      })
      .catch(() => {
        // guest checkout still works with auth metadata only
      })
      .finally(() => {
        if (!cancelled) setProfileLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, accessToken, user, profileLoaded]);

  if (!isReady || items.length === 0) {
    return (
      <main className="container page-section">
        <p className="text-muted">Chargement…</p>
      </main>
    );
  }

  const allCanFulfill = validation?.items.every((line) => line.canFulfill) ?? false;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Indiquez votre nom complet.");
      return;
    }
    if (!trimmedEmail) {
      setError("Indiquez votre adresse e-mail.");
      return;
    }
    if (!isValidCiLocal(phone)) {
      setError(CI_PHONE_ERROR);
      return;
    }
    if (!validation || !allCanFulfill) {
      setError("Votre panier contient des articles indisponibles. Retournez au panier.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCheckoutSession(
        items.map((i) => ({ productPublicId: i.productPublicId, quantity: i.quantity })),
        {
          customerFullName: trimmedName,
          customerEmail: trimmedEmail,
          customerPhoneE164: ciLocalToE164(phone),
        },
        { accessToken },
      );

      if (!result.waveLaunchUrl) {
        setError("Session de paiement indisponible. Réessayez.");
        setSubmitting(false);
        return;
      }

      saveOrderAccessToken(result.publicReference, result.accessToken);
      window.location.href = result.waveLaunchUrl;
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError) {
        if (err.code === "INSUFFICIENT_STOCK") {
          setError("Stock insuffisant pour un ou plusieurs articles. Retournez au panier.");
          return;
        }
        setError(err.message || "Impossible de démarrer le paiement.");
        return;
      }
      setError("Impossible de démarrer le paiement. Réessayez.");
    }
  }

  return (
    <main className="container page-section">
      <div className="fade-in" style={{ marginBottom: 28 }}>
        <span className="eyebrow">Commande</span>
        <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Finaliser la commande</h1>
        <p className="text-muted" style={{ marginTop: 8, fontSize: "0.9rem" }}>
          Renseignez vos coordonnées pour recevoir vos codes cadeaux.
        </p>
      </div>

      <div
        className="fade-in-delay-1"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
          gap: 32,
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="surface-card"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
        >
          <h2 style={{ fontSize: "1.15rem" }}>Coordonnées</h2>

          <div>
            <label htmlFor="fullName" className="field-label">
              Nom complet
            </label>
            <input
              id="fullName"
              type="text"
              className="input"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="email" className="field-label">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="phone" className="field-label">
              Téléphone mobile (Wave)
            </label>
            <PhoneInput id="phone" value={phone} onChange={setPhone} required describedBy="phone-hint" />
            <p id="phone-hint" className="field-hint">
              Numéro ivoirien à 10 chiffres, celui de votre compte Wave.
            </p>
          </div>

          {error ? (
            <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>
          ) : null}

          {validateStatus === "error" ? (
            <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>
              Impossible de vérifier le panier.{" "}
              <Link href="/panier" className="text-accent">
                Retour au panier
              </Link>
            </p>
          ) : null}

          {!allCanFulfill && validation ? (
            <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>
              Certains articles ne sont plus disponibles en quantité suffisante.{" "}
              <Link href="/panier" className="text-accent">
                Modifier le panier
              </Link>
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                submitting ||
                validateStatus === "loading" ||
                validateStatus === "error" ||
                !allCanFulfill
              }
            >
              {submitting ? "Redirection…" : "Payer avec Wave"}
            </button>
            <Link href="/panier" className="btn btn-secondary">
              Retour
            </Link>
          </div>
        </form>

        <aside
          className="surface-card"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, alignSelf: "start" }}
        >
          <h2 style={{ fontSize: "1.15rem" }}>Récapitulatif</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {(validation?.items ?? []).map((line) => (
              <li
                key={line.productPublicId}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.88rem" }}
              >
                <span>
                  {line.productName} × {line.quantity}
                </span>
                <span>{formatXOF(line.totalAmountMinor)}</span>
              </li>
            ))}
            {!validation &&
              items.map((item) => (
                <li
                  key={item.productPublicId}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.88rem" }}
                >
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span>{formatXOF(item.unitAmountMinor * item.quantity)}</span>
                </li>
              ))}
          </ul>
          <hr className="divider" />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total</span>
            <span>
              {validateStatus === "loading"
                ? "…"
                : formatXOF(validation?.totalAmountMinor ?? 0)}
            </span>
          </div>
        </aside>
      </div>

      <style>{`
        @media (max-width: 760px) {
          main.container > div[class*="fade-in-delay-1"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
