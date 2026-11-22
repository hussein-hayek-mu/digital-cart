"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { formatDateTime, StatusBadge, useAdminQuery } from "@/components/admin/admin-shell";
import { adminApi } from "@/lib/admin-api";
import { formatXOF, orderStatusLabel, orderStatusTone } from "@/lib/format";

const STATUS_FILTERS = [
  "",
  "manual_review",
  "fulfilled",
  "pending_payment",
  "refund_pending",
  "refunded",
  "expired",
  "payment_failed",
];

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-muted">Chargement…</p>}>
      <OrdersView />
    </Suspense>
  );
}

function OrdersView() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const [draft, setDraft] = useState(q);
  const { data: orders, error } = useAdminQuery((t) => adminApi.orders(t, q, status), [q, status]);

  function go(next: { q?: string; status?: string }) {
    const sp = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    if (nq) sp.set("q", nq);
    if (ns) sp.set("status", ns);
    router.replace(`/admin/commandes${sp.size ? `?${sp}` : ""}`);
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    go({ q: draft.trim() });
  }

  return (
    <div className="admin-page">
      <h1 className="admin-title">Commandes</h1>

      <form className="admin-filters" onSubmit={handleSearch} role="search">
        <input
          className="input"
          type="search"
          placeholder="Référence, e-mail, nom ou téléphone"
          aria-label="Rechercher une commande"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <select
          className="input"
          aria-label="Filtrer par statut"
          value={status}
          onChange={(e) => go({ status: e.target.value })}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s ? orderStatusLabel(s) : "Tous les statuts"}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary btn-sm">
          Rechercher
        </button>
      </form>

      {error && <p className="form-error">{error}</p>}
      {!orders && !error && <p className="text-muted">Chargement…</p>}
      {orders && orders.length === 0 && <p className="text-muted">Aucune commande trouvée.</p>}
      {orders && orders.length > 0 && (
        <div className="surface-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Client</th>
                <th>Total</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.publicReference}>
                  <td>
                    <Link href={`/admin/commandes/${o.publicReference}`} className="admin-link admin-mono">
                      {o.publicReference}
                    </Link>
                  </td>
                  <td>
                    {o.customerFullName}
                    <div className="text-muted admin-table__sub">{o.customerEmail}</div>
                  </td>
                  <td className="admin-num">{formatXOF(o.totalAmountMinor)}</td>
                  <td>
                    <StatusBadge label={orderStatusLabel(o.status)} tone={orderStatusTone(o.status)} />
                  </td>
                  <td className="text-muted">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 100 && (
            <p className="text-muted admin-table__note">Seules les 100 plus récentes sont affichées. Affinez la recherche.</p>
          )}
        </div>
      )}
    </div>
  );
}
