"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ApiError, getOrderStatus, type OrderStatusResult } from "@/lib/api";
import { formatXOF } from "@/lib/format";

const POLL_MS = 2000;
const TERMINAL_SUCCESS = new Set(["fulfilled", "manual_review"]);
const TERMINAL_FAILURE = new Set(["payment_failed", "expired"]);

function TraitementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const publicRef = searchParams.get("ref");
  const { clearCart } = useCart();

  const [order, setOrder] = useState<OrderStatusResult | null>(null);
  const [phase, setPhase] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState<string | null>(null);
  const cartCleared = useRef(false);

  useEffect(() => {
    if (!publicRef) {
      setPhase("error");
      setError("Référence de commande manquante.");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      const ref = publicRef;
      if (!ref) return;

      try {
        const status = await getOrderStatus(ref);
        if (cancelled) return;

        setOrder(status);

        if (TERMINAL_FAILURE.has(status.status)) {
          router.replace(`/paiement/echec?ref=${encodeURIComponent(ref)}`);
          return;
        }

        if (TERMINAL_SUCCESS.has(status.status)) {
          if (!cartCleared.current) {
            cartCleared.current = true;
            clearCart();
          }
          setPhase("success");
          return;
        }

        timer = setTimeout(poll, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setPhase("error");
          setError("Commande introuvable.");
          return;
        }
        timer = setTimeout(poll, POLL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [publicRef, router, clearCart]);

  if (phase === "error") {
    return (
      <main className="container page-section">
        <div className="surface-card fade-in" style={{ maxWidth: 520, margin: "0 auto", padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: 12 }}>Erreur</h1>
          <p className="text-muted" style={{ marginBottom: 24 }}>{error}</p>
          <Link href="/panier" className="btn btn-primary">
            Retour au panier
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "success" && order) {
    const manualReview = order.status === "manual_review";

    return (
      <main className="container page-section">
        <div
          className="surface-card fade-in"
          style={{ maxWidth: 560, margin: "0 auto", padding: 36, textAlign: "center" }}
        >
          <span className="badge badge-ok" style={{ marginBottom: 16 }}>
            <span className="badge-dot" />
            {manualReview ? "Commande en revue" : "Paiement confirmé"}
          </span>
          <h1 style={{ fontSize: "1.75rem", marginBottom: 10 }}>
            {manualReview ? "Commande reçue" : "Merci pour votre commande !"}
          </h1>
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Référence : <strong>{order.publicReference}</strong>
          </p>
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Montant : {formatXOF(order.totalAmountMinor)}
          </p>
          <p style={{ marginTop: 20, marginBottom: 28, fontSize: "0.95rem" }}>
            {manualReview
              ? "Votre commande est en cours de vérification. Vous recevrez un e-mail dès que vos codes seront disponibles."
              : "Vos codes sont prêts. Un lien pour les retrouver plus tard vous a aussi été envoyé par e-mail."}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href={`/commande/${encodeURIComponent(order.publicReference)}`} className="btn btn-primary">
              {manualReview ? "Suivre ma commande" : "Voir mes codes"}
            </Link>
            <Link href="/produits" className="btn btn-secondary">
              Continuer mes achats
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="container page-section">
      <div
        className="surface-card fade-in"
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: 40,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "3px solid var(--color-border-strong)",
            borderTopColor: "var(--color-accent)",
            animation: "spin 0.9s linear infinite",
          }}
        />
        <span className="eyebrow">Traitement</span>
        <h1 style={{ fontSize: "1.5rem" }}>Finalisation de votre commande…</h1>
        <p className="text-muted" style={{ fontSize: "0.92rem" }}>
          {publicRef ? (
            <>
              Commande <strong>{publicRef}</strong> — vérification du paiement et préparation des
              codes.
            </>
          ) : (
            "Vérification du paiement en cours."
          )}
        </p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}

export default function TraitementPage() {
  return (
    <Suspense
      fallback={
        <main className="container page-section">
          <p className="text-muted">Chargement…</p>
        </main>
      }
    >
      <TraitementContent />
    </Suspense>
  );
}
