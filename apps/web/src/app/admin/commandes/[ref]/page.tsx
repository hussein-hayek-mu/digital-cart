"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { formatDateTime, StatusBadge, useAdminQuery, useAdminToken } from "@/components/admin/admin-shell";
import { activityLabel, actorLabel, adminApi, adminErrorMessage } from "@/lib/admin-api";
import { formatXOF, orderStatusLabel, orderStatusTone } from "@/lib/format";

const PAYMENT_STATUS: Record<string, string> = {
  created: "créé",
  session_open: "en attente",
  succeeded: "reçu",
  failed: "échoué",
  expired: "expiré",
  refund_pending: "remboursement en cours",
  refunded: "remboursé",
};

export default function AdminOrderPage() {
  const { ref } = useParams<{ ref: string }>();
  const token = useAdminToken();
  const { data, error, reload } = useAdminQuery((t) => adminApi.order(t, ref), [ref]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ text: success });
      reload();
    } catch (err) {
      setMessage({ text: adminErrorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  function refund(step: "start" | "complete") {
    const note = window.prompt(
      step === "start"
        ? "Raison du remboursement (visible dans le journal) :"
        : "Comment l’argent a-t-il été rendu ? (ex. : Wave le 12/10, n° de transaction)",
    );
    if (!note?.trim()) return;
    void run(
      () => adminApi.refund(token, ref, step, note.trim()),
      step === "start" ? "Remboursement démarré." : "Remboursement marqué comme terminé.",
    );
  }

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="text-muted">Chargement…</p>;
  const { order, items, payment, codes, history } = data;
  const s = order.status;

  return (
    <div className="admin-page">
      <Link href="/admin/commandes" className="admin-back">
        ← Toutes les commandes
      </Link>
      <div className="admin-head">
        <h1 className="admin-title admin-mono">{order.publicReference}</h1>
        <StatusBadge label={orderStatusLabel(s)} tone={orderStatusTone(s)} />
      </div>

      {message && <p className={message.error ? "form-error" : "admin-success"} role="status">{message.text}</p>}

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Actions</h2>
        {s === "manual_review" && (
          <p className="text-muted admin-hint">
            Cette commande a été payée mais n’a pas pu être livrée automatiquement (stock épuisé ou paiement arrivé après
            expiration). Vérifiez le paiement, ajoutez des codes si besoin, puis livrez-la.
          </p>
        )}
        <div className="admin-actions">
          {s === "manual_review" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy}
              onClick={() => run(() => adminApi.fulfil(token, ref), "Commande livrée. Le client peut voir ses codes.")}>
              Livrer la commande
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
            onClick={() => run(() => adminApi.resendLink(token, ref), `Lien envoyé à ${order.customerEmail}.`)}>
            Renvoyer le lien au client
          </button>
          {(s === "paid" || s === "fulfilled" || s === "manual_review") && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => refund("start")}>
              Démarrer un remboursement
            </button>
          )}
          {s === "refund_pending" && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => refund("complete")}>
              Marquer comme remboursée
            </button>
          )}
        </div>
        {(s === "paid" || s === "fulfilled" || s === "manual_review" || s === "refund_pending") && (
          <p className="field-hint admin-hint">
            Le remboursement se fait pour l’instant hors du site (Wave, espèces…) ; ici, vous l’enregistrez seulement.
          </p>
        )}
      </section>

      <div className="admin-grid-2">
        <section className="surface-card admin-card">
          <h2 className="admin-subtitle">Client</h2>
          <dl className="admin-dl">
            <dt>Nom</dt>
            <dd>{order.customerFullName}</dd>
            <dt>E-mail</dt>
            <dd>{order.customerEmail}</dd>
            <dt>Téléphone</dt>
            <dd>{order.customerPhone}</dd>
            <dt>Compte</dt>
            <dd>{order.hasAccount ? "Connecté" : "Invité"}</dd>
          </dl>
        </section>
        <section className="surface-card admin-card">
          <h2 className="admin-subtitle">Paiement</h2>
          <dl className="admin-dl">
            <dt>Créée</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
            <dt>Payée</dt>
            <dd>{order.paidAt ? formatDateTime(order.paidAt) : "—"}</dd>
            <dt>Livrée</dt>
            <dd>{order.fulfilledAt ? formatDateTime(order.fulfilledAt) : "—"}</dd>
            <dt>Moyen</dt>
            <dd>
              {payment
                ? `${payment.provider === "fake" ? "Test" : payment.provider === "wave" ? "Wave" : payment.provider} · ${
                    PAYMENT_STATUS[payment.status] ?? payment.status
                  }`
                : "—"}
            </dd>
            {payment?.transactionId && (
              <>
                <dt>Transaction</dt>
                <dd className="admin-mono">{payment.transactionId}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Articles</h2>
        <ul className="admin-lines">
          {items.map((i, idx) => (
            <li key={idx}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <span className="admin-num">{formatXOF(i.totalAmountMinor)}</span>
            </li>
          ))}
          <li className="admin-lines__total">
            <span>Total</span>
            <span className="admin-num">{formatXOF(order.totalAmountMinor)}</span>
          </li>
        </ul>
      </section>

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Codes livrés</h2>
        {codes.length === 0 ? (
          <p className="text-muted">Aucun code livré.</p>
        ) : (
          <ul className="admin-lines">
            {codes.map((c, idx) => (
              <li key={idx}>
                <span>
                  <span className="admin-mono">{c.maskedCode}</span>
                  <span className="text-muted"> · {c.productName}</span>
                </span>
                <span className="text-muted">
                  {c.revealCount > 0 ? `Vu ${c.revealCount} fois` : "Pas encore affiché"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Historique</h2>
        {history.length === 0 ? (
          <p className="text-muted">Aucun événement.</p>
        ) : (
          <ul className="admin-lines">
            {history.map((h, idx) => (
              <li key={idx}>
                <span>
                  {activityLabel(h.action)}
                  <span className="text-muted"> · {actorLabel(h)}</span>
                  {typeof h.metadata.note === "string" && <span className="text-muted"> — {h.metadata.note}</span>}
                </span>
                <span className="text-muted">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
