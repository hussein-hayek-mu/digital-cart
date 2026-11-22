"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { useAuth } from "@/components/auth-provider";
import { PhoneInput } from "@/components/phone-input";
import { ApiError } from "@/lib/api";
import { OrderList } from "@/components/order-list";
import { adminApi } from "@/lib/admin-api";
import { CI_PHONE_ERROR, ciLocalToE164, isValidCiLocal, toCiLocalDigits } from "@/lib/phone";
import {
  getMyOrders,
  getProfile,
  updateProfile,
  type OrderSummary,
  type Profile,
} from "@/lib/auth-api";

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Votre session n’a pas pu être vérifiée. Déconnectez-vous puis reconnectez-vous.";
    }
    return "Le serveur n’a pas pu charger votre profil. Réessayez dans un instant.";
  }
  return "Impossible de joindre le serveur. Vérifiez que l’API est démarrée (port 3001).";
}

export default function ComptePage() {
  const router = useRouter();
  const { user, accessToken, isLoading, isConfigured, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isConfigured || isLoading) return;
    if (!user || !accessToken) {
      router.replace("/connexion");
      return;
    }

    const authToken = accessToken;
    let cancelled = false;

    async function load(token: string) {
      try {
        const profileData = await getProfile(token);
        if (cancelled) return;
        setProfile(profileData);
        setFullName(profileData.fullName ?? "");
        setPhone(toCiLocalDigits(profileData.phoneE164));
      } catch (err) {
        if (!cancelled) setError(describeLoadError(err));
        return;
      }

      try {
        const ordersData = await getMyOrders(token);
        if (!cancelled) setOrders(ordersData.orders);
      } catch {
        // Order history is secondary; the profile stays editable.
      }

      adminApi.me(token).then(
        () => !cancelled && setIsAdmin(true),
        () => {},
      );
    }

    void load(authToken);
    return () => {
      cancelled = true;
    };
  }, [isConfigured, isLoading, user, accessToken, router]);

  if (!isConfigured) {
    return (
      <main className="page-section">
        <div className="container" style={{ maxWidth: 520 }}>
          <AuthNotice />
        </div>
      </main>
    );
  }

  if (isLoading || (!user && isConfigured)) {
    return (
      <main className="page-section">
        <div className="container text-muted">Chargement…</div>
      </main>
    );
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!accessToken) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    if (phone && !isValidCiLocal(phone)) {
      setSaving(false);
      setError(CI_PHONE_ERROR);
      return;
    }

    try {
      const payload: { fullName?: string; phoneE164?: string } = {};
      if (fullName.trim()) payload.fullName = fullName.trim();
      if (phone) payload.phoneE164 = ciLocalToE164(phone);

      const updated = await updateProfile(accessToken, payload);
      setProfile(updated);
      setMessage("Profil mis à jour.");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Votre session a expiré. Reconnectez-vous puis réessayez."
          : "Échec de la mise à jour. Réessayez dans un instant.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <main className="page-section">
      <div className="container fade-in" style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">Mon compte</span>
            <h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.2rem)", marginTop: 10 }}>Profil</h1>
            <p className="text-muted" style={{ marginTop: 8 }}>
              {profile?.email ?? user?.email}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Se déconnecter
          </button>
        </div>

        <section className="surface-card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 18 }}>Informations personnelles</h2>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label htmlFor="fullName" className="field-label">
                Nom complet
              </label>
              <input
                id="fullName"
                type="text"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="phone" className="field-label">
                Téléphone
              </label>
              <PhoneInput id="phone" value={phone} onChange={setPhone} describedBy="phone-hint" />
              <p id="phone-hint" className="field-hint">
                Numéro ivoirien à 10 chiffres, utilisé pour le paiement Wave.
              </p>
            </div>
            {message ? <p style={{ color: "var(--color-ok)", fontSize: "0.9rem" }}>{message}</p> : null}
            {error ? <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p> : null}
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: "flex-start" }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </section>

        {isAdmin && (
          <section className="surface-card" style={{ padding: 28 }}>
            <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Espace admin</h2>
            <p className="text-muted" style={{ fontSize: "0.9rem" }}>
              Stock, produits, commandes et journal d’activité.
            </p>
            <Link href="/admin" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
              Ouvrir l’espace admin
            </Link>
          </section>
        )}

        <section className="surface-card" style={{ padding: 28 }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: 18 }}>Commandes récentes</h2>
          {orders.length === 0 ? (
            <p className="text-faint" style={{ fontSize: "0.9rem" }}>
              Aucune commande pour le moment.
            </p>
          ) : (
            <OrderList orders={orders.slice(0, 3)} />
          )}
          <Link
            href={orders.length === 0 ? "/produits" : "/compte/commandes"}
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 16 }}
          >
            {orders.length === 0 ? "Parcourir les cartes" : "Voir toutes mes commandes"}
          </Link>
        </section>
      </div>
    </main>
  );
}
