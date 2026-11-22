"use client";

import Link from "next/link";
import { useAdminQuery } from "@/components/admin/admin-shell";
import { adminApi } from "@/lib/admin-api";
import { formatXOF } from "@/lib/format";

export default function AdminDashboardPage() {
  const { data, error } = useAdminQuery(adminApi.summary);

  return (
    <div className="admin-page">
      <h1 className="admin-title">Tableau de bord</h1>
      {error && <p className="form-error">{error}</p>}
      {!data && !error && <p className="text-muted">Chargement…</p>}
      {data && (
        <>
          <div className="admin-stats">
            <Stat label="Commandes payées aujourd’hui" value={String(data.ordersToday)} />
            <Stat label="Ventes aujourd’hui" value={formatXOF(data.revenueTodayMinor)} />
            <Stat label="Ventes sur 30 jours" value={formatXOF(data.revenue30dMinor)} />
          </div>

          <section className="surface-card admin-card">
            <h2 className="admin-subtitle">À traiter</h2>
            {data.manualReview === 0 && data.refundPending === 0 && data.lowStock.length === 0 ? (
              <p className="text-muted">Rien à signaler.</p>
            ) : (
              <ul className="admin-todo">
                {data.manualReview > 0 && (
                  <li>
                    <Link href="/admin/commandes?status=manual_review">
                      {data.manualReview} commande{data.manualReview > 1 ? "s" : ""} en vérification
                    </Link>
                    <span className="text-muted"> — payée(s) mais pas encore livrée(s).</span>
                  </li>
                )}
                {data.refundPending > 0 && (
                  <li>
                    <Link href="/admin/commandes?status=refund_pending">
                      {data.refundPending} remboursement{data.refundPending > 1 ? "s" : ""} en cours
                    </Link>
                  </li>
                )}
                {data.lowStock.map((p) => (
                  <li key={p.publicId}>
                    <Link href={`/admin/produits/${p.publicId}`}>{p.name}</Link>
                    <span className="text-muted">
                      {" "}
                      — {p.available === 0 ? "épuisé" : `plus que ${p.available} code${p.available > 1 ? "s" : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card admin-stat">
      <p className="text-muted admin-stat__label">{label}</p>
      <p className="admin-stat__value">{value}</p>
    </div>
  );
}
