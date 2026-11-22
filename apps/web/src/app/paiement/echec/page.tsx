"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function EchecContent() {
  const searchParams = useSearchParams();
  const publicRef = searchParams.get("ref");

  return (
    <main className="container page-section">
      <div
        className="surface-card fade-in"
        style={{ maxWidth: 520, margin: "0 auto", padding: 36, textAlign: "center" }}
      >
        <span className="badge badge-danger" style={{ marginBottom: 16 }}>
          <span className="badge-dot" />
          Paiement échoué
        </span>
        <h1 style={{ fontSize: "1.75rem", marginBottom: 12 }}>Le paiement n&apos;a pas abouti</h1>
        {publicRef ? (
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Référence : <strong>{publicRef}</strong>
          </p>
        ) : null}
        <p className="text-muted" style={{ marginBottom: 28, fontSize: "0.95rem" }}>
          Votre commande n&apos;a pas été finalisée. Aucun débit n&apos;a été effectué. Vous
          pouvez réessayer depuis votre panier.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/panier" className="btn btn-primary">
            Retour au panier
          </Link>
          <Link href="/produits" className="btn btn-secondary">
            Voir les produits
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function EchecPage() {
  return (
    <Suspense
      fallback={
        <main className="container page-section">
          <p className="text-muted">Chargement…</p>
        </main>
      }
    >
      <EchecContent />
    </Suspense>
  );
}
