"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { GiftCardArt } from "@/components/gift-card-art";
import { validateCart, type CartValidateResult } from "@/lib/api";
import { formatXOF, regionLabel, stockLabelText, stockLabelTone } from "@/lib/format";

export default function PanierPage() {
  const { items, isReady, updateQuantity, removeItem } = useCart();
  const [validation, setValidation] = useState<CartValidateResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!isReady) return;
    if (items.length === 0) {
      setValidation(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    validateCart(items.map((i) => ({ productPublicId: i.productPublicId, quantity: i.quantity })))
      .then((result) => {
        if (!cancelled) {
          setValidation(result);
          setStatus("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [items, isReady]);

  if (!isReady) {
    return (
      <main className="container page-section">
        <p className="text-muted">Chargement du panier…</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="container page-section fade-in">
        <h1 style={{ fontSize: "2rem" }}>Votre panier est vide</h1>
        <p className="text-muted" style={{ marginTop: 10, marginBottom: 24 }}>
          Ajoutez des cartes cadeaux depuis le catalogue pour commencer.
        </p>
        <Link href="/produits" className="btn btn-primary">
          Voir les produits
        </Link>
      </main>
    );
  }

  const validatedByPublicId = new Map(
    (validation?.items ?? []).map((line) => [line.productPublicId, line]),
  );

  return (
    <main className="container page-section">
      <div className="fade-in" style={{ marginBottom: 28 }}>
        <span className="eyebrow">Panier</span>
        <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Votre panier</h1>
        {status === "error" ? (
          <p style={{ color: "var(--color-danger)", marginTop: 8, fontSize: "0.9rem" }}>
            Impossible de vérifier les prix auprès du serveur. Réessayez dans un instant.
          </p>
        ) : null}
      </div>

      <div
        className="fade-in-delay-1"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => {
            const server = validatedByPublicId.get(item.productPublicId);
            const unitPrice = server?.unitAmountMinor ?? item.unitAmountMinor;
            const total = server?.totalAmountMinor ?? unitPrice * item.quantity;
            const label = server?.stockLabel;
            const canFulfill = server ? server.canFulfill : true;

            return (
              <div
                key={item.productPublicId}
                className="surface-card"
                style={{
                  padding: 18,
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link href={`/produits/${item.slug}`} className="cart-thumb" aria-hidden="true" tabIndex={-1}>
                  <GiftCardArt
                    variant="thumb"
                    platform={item.platform}
                    faceValue={item.faceValue}
                    faceCurrency={item.faceCurrency}
                    region={item.region}
                    imageUrl={item.imageUrl}
                  />
                </Link>

                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <Link href={`/produits/${item.slug}`} style={{ fontWeight: 600 }}>
                    {item.name}
                  </Link>
                  <div className="text-muted" style={{ fontSize: "0.82rem", marginTop: 4 }}>
                    {regionLabel(item.region)} · {formatXOF(unitPrice)} / unité
                  </div>
                  {label ? (
                    <span
                      className={`badge badge-${stockLabelTone(label)}`}
                      style={{ marginTop: 6 }}
                    >
                      <span className="badge-dot" />
                      {stockLabelText(label)}
                    </span>
                  ) : null}
                  {!canFulfill ? (
                    <div style={{ color: "var(--color-danger)", fontSize: "0.78rem", marginTop: 4 }}>
                      Quantité indisponible en totalité — réduisez la quantité.
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateQuantity(item.productPublicId, item.quantity - 1)}
                    aria-label="Diminuer la quantité"
                  >
                    −
                  </button>
                  <span style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}>
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateQuantity(item.productPublicId, item.quantity + 1)}
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>

                <div style={{ fontWeight: 700, minWidth: 96, textAlign: "right" }}>
                  {formatXOF(total)}
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeItem(item.productPublicId)}
                  aria-label="Retirer du panier"
                  style={{ color: "var(--color-danger)" }}
                >
                  Retirer
                </button>
              </div>
            );
          })}
        </div>

        <aside
          className="surface-card"
          style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, alignSelf: "start" }}
        >
          <h2 style={{ fontSize: "1.2rem" }}>Résumé</h2>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
            <span className="text-muted">Sous-total (prix serveur)</span>
            <span>
              {status === "loading"
                ? "…"
                : formatXOF(validation?.subtotalAmountMinor ?? 0)}
            </span>
          </div>
          <hr className="divider" />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.05rem" }}>
            <span>Total</span>
            <span>
              {status === "loading" ? "…" : formatXOF(validation?.totalAmountMinor ?? 0)}
            </span>
          </div>

          {(() => {
            const allCanFulfill =
              validation?.items.every((line) => line.canFulfill) ?? false;
            const canPay =
              status !== "loading" &&
              status !== "error" &&
              validation !== null &&
              allCanFulfill;

            return canPay ? (
              <Link href="/panier/commande" className="btn btn-primary btn-block">
                Payer
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled
                title={
                  status === "loading"
                    ? "Vérification en cours…"
                    : !allCanFulfill
                      ? "Corrigez les quantités indisponibles"
                      : "Panier non validé"
                }
              >
                Payer
              </button>
            );
          })()}
          <p className="text-faint" style={{ fontSize: "0.78rem" }}>
            Paiement sécurisé via Wave (simulation en développement).
          </p>
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
