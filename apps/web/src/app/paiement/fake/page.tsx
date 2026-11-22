"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, completeFakePayment } from "@/lib/api";

function FakePaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const refFromQuery = searchParams.get("ref");

  const [phase, setPhase] = useState<"processing" | "error">("processing");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setPhase("error");
      setError("Session de paiement introuvable.");
      return;
    }

    let cancelled = false;

    async function run() {
      const sid = sessionId;
      if (!sid) return;

      try {
        const result = await completeFakePayment(sid);
        if (cancelled) return;

        const publicRef = result.publicReference ?? refFromQuery;
        if (!publicRef) {
          setPhase("error");
          setError("Référence de commande introuvable après le paiement.");
          return;
        }

        router.replace(`/paiement/traitement?ref=${encodeURIComponent(publicRef)}`);
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        if (err instanceof ApiError) {
          setError(err.message || "Échec de la simulation de paiement.");
        } else {
          setError("Échec de la simulation de paiement.");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refFromQuery, router]);

  if (phase === "error") {
    return (
      <main className="container page-section">
        <div className="surface-card fade-in" style={{ maxWidth: 480, margin: "0 auto", padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: 12 }}>Simulation Wave — erreur</h1>
          <p className="text-muted" style={{ marginBottom: 24 }}>
            {error ?? "Une erreur est survenue."}
          </p>
          <Link href="/panier" className="btn btn-primary">
            Retour au panier
          </Link>
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
          gap: 20,
        }}
      >
        <div
          className="payment-spinner"
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
        <span className="eyebrow">Wave (simulation)</span>
        <h1 style={{ fontSize: "1.5rem" }}>Simulation Wave…</h1>
        <p className="text-muted" style={{ fontSize: "0.92rem" }}>
          Traitement du paiement de test en cours. Ne fermez pas cette page.
        </p>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .payment-spinner { animation: none; border-top-color: var(--color-accent); }
        }
      `}</style>
    </main>
  );
}

export default function FakePaymentPage() {
  return (
    <Suspense
      fallback={
        <main className="container page-section">
          <p className="text-muted">Chargement…</p>
        </main>
      }
    >
      <FakePaymentContent />
    </Suspense>
  );
}
