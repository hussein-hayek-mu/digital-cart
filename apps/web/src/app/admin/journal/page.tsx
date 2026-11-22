"use client";

import { useState } from "react";
import { formatDateTime, useAdminQuery } from "@/components/admin/admin-shell";
import { activityLabel, actorLabel, adminApi, type ActivityEntry } from "@/lib/admin-api";

export default function AdminActivityPage() {
  const [all, setAll] = useState(false);
  const { data, error } = useAdminQuery((t) => adminApi.activity(t, all), [all]);

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1 className="admin-title">Journal</h1>
        <label className="admin-form__check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>Inclure l’activité des clients</span>
        </label>
      </div>
      <p className="text-muted">Les 200 dernières actions. Les codes n’apparaissent jamais en entier.</p>

      {error && <p className="form-error">{error}</p>}
      {!data && !error && <p className="text-muted">Chargement…</p>}
      {data && data.length === 0 && <p className="text-muted">Aucune activité pour l’instant.</p>}
      {data && data.length > 0 && (
        <div className="surface-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Qui</th>
                <th>Action</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted">{formatDateTime(e.createdAt)}</td>
                  <td>{actorLabel(e)}</td>
                  <td>{activityLabel(e.action)}</td>
                  <td className="text-muted">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function describe(e: ActivityEntry): string {
  const m = e.metadata ?? {};
  const parts: string[] = [];
  if (typeof m.publicReference === "string") parts.push(m.publicReference);
  if (typeof m.name === "string") parts.push(m.name);
  if (typeof m.maskedCode === "string") parts.push(m.maskedCode);
  if (typeof m.added === "number") parts.push(`${m.added} ajouté(s)`);
  if (typeof m.codes === "number") parts.push(`${m.codes} code(s)`);
  if (m.changes && typeof m.changes === "object") {
    for (const [key, change] of Object.entries(m.changes as Record<string, { from: unknown; to: unknown }>)) {
      parts.push(
        key === "saleAmountMinor"
          ? `prix ${Number(change.from).toLocaleString("fr-FR")} → ${Number(change.to).toLocaleString("fr-FR")} FCFA`
          : key === "isActive"
            ? change.to
              ? "rendu visible"
              : "masqué"
            : `${key} modifié`,
      );
    }
  }
  if (typeof m.note === "string") parts.push(`« ${m.note} »`);
  return parts.join(" · ") || "—";
}
