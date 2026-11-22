"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatDateTime, StatusBadge, useAdminQuery, useAdminToken } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { adminApi, adminErrorMessage, type AddCodesResult } from "@/lib/admin-api";

const CODE_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  available: { label: "Disponible", tone: "ok" },
  reserved: { label: "Réservé", tone: "warn" },
  sold: { label: "Vendu", tone: "neutral" },
  disabled: { label: "Désactivé", tone: "danger" },
};

export default function AdminProductPage() {
  const { id } = useParams<{ id: string }>();
  const token = useAdminToken();
  const { data, error, reload, setData } = useAdminQuery((t) => adminApi.codes(t, id), [id]);
  const { data: categories } = useAdminQuery(adminApi.categories);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [codesText, setCodesText] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAddCodes(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminApi.addCodes(token, id, codesText);
      setCodesText("");
      setMessage({ text: describeUpload(result) });
      reload();
    } catch (err) {
      setMessage({ text: adminErrorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function toggleCode(codeId: string, disable: boolean) {
    if (disable && !window.confirm("Désactiver ce code ? Il ne sera plus vendu.")) return;
    try {
      await adminApi.setCodeDisabled(token, codeId, disable);
      reload();
    } catch (err) {
      setMessage({ text: adminErrorMessage(err), error: true });
    }
  }

  if (error) return <p className="form-error">{error}</p>;
  if (!data) return <p className="text-muted">Chargement…</p>;
  const { product, codes } = data;

  return (
    <div className="admin-page">
      <Link href="/admin/produits" className="admin-back">
        ← Tous les produits
      </Link>
      <div className="admin-head">
        <h1 className="admin-title">{product.name}</h1>
        {product.isActive ? <StatusBadge label="Visible" tone="ok" /> : <StatusBadge label="Masqué" tone="neutral" />}
      </div>

      <div className="admin-stats">
        <Stat label="Disponibles" value={product.stock.available} />
        <Stat label="Réservés (paiement en cours)" value={product.stock.reserved} />
        <Stat label="Vendus" value={product.stock.sold} />
        <Stat label="Désactivés" value={product.stock.disabled} />
      </div>

      {message && <p className={message.error ? "form-error" : "admin-success"} role="status">{message.text}</p>}

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Ajouter des codes</h2>
        <form onSubmit={handleAddCodes} className="admin-codes-form">
          <label>
            <span className="field-label">Un code par ligne (500 maximum)</span>
            <textarea
              className="input admin-mono"
              rows={6}
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
              placeholder={"XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY"}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="field-hint">
            Les codes sont chiffrés dès l’envoi. Les doublons et les codes déjà en stock sont ignorés.
          </p>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !codesText.trim()}>
            {busy ? "Ajout…" : "Ajouter au stock"}
          </button>
        </form>
      </section>

      <section className="surface-card admin-card">
        <div className="admin-head">
          <h2 className="admin-subtitle">Infos et prix</h2>
          {!editing && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              Modifier
            </button>
          )}
        </div>
        {editing && categories ? (
          <ProductForm
            categories={categories}
            initial={product}
            submitLabel="Enregistrer"
            onSubmit={async (input) => {
              try {
                const updated = await adminApi.updateProduct(token, id, input);
                setData((d) => (d ? { ...d, product: updated } : d));
                setEditing(false);
                setMessage({ text: "Produit enregistré." });
              } catch (err) {
                setMessage({ text: adminErrorMessage(err), error: true });
              }
            }}
          />
        ) : (
          <dl className="admin-dl">
            <dt>Prix</dt>
            <dd>{product.saleAmountMinor.toLocaleString("fr-FR")} FCFA</dd>
            <dt>Catégorie</dt>
            <dd>{product.categoryName}</dd>
            <dt>Carte</dt>
            <dd>
              {product.faceValue} {product.faceCurrency} · {product.platform} · {product.region}
            </dd>
            <dt>Alerte stock bas</dt>
            <dd>{product.lowStockThreshold} codes ou moins</dd>
          </dl>
        )}
      </section>

      <section className="surface-card admin-card">
        <h2 className="admin-subtitle">Codes ({codes.length})</h2>
        {codes.length === 0 ? (
          <p className="text-muted">Aucun code pour ce produit.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Statut</th>
                  <th>Commande</th>
                  <th>Ajouté le</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => {
                  const s = CODE_STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
                  return (
                    <tr key={c.id}>
                      <td className="admin-mono">{c.maskedCode}</td>
                      <td>
                        <StatusBadge label={s.label} tone={s.tone} />
                      </td>
                      <td>
                        {c.orderReference ? (
                          <Link href={`/admin/commandes/${c.orderReference}`} className="admin-link">
                            {c.orderReference}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-muted">{formatDateTime(c.createdAt)}</td>
                      <td>
                        {c.status === "available" && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleCode(c.id, true)}>
                            Désactiver
                          </button>
                        )}
                        {c.status === "disabled" && (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleCode(c.id, false)}>
                            Réactiver
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card admin-stat">
      <p className="text-muted admin-stat__label">{label}</p>
      <p className="admin-stat__value">{value}</p>
    </div>
  );
}

function describeUpload(r: AddCodesResult): string {
  const parts = [`${r.added} code${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""}`];
  if (r.alreadyInStock) parts.push(`${r.alreadyInStock} déjà en stock`);
  if (r.duplicatesInInput) parts.push(`${r.duplicatesInInput} en double dans la liste`);
  if (r.invalid) parts.push(`${r.invalid} invalide${r.invalid > 1 ? "s" : ""}`);
  return `${parts.join(" · ")}.`;
}
