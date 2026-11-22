"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusBadge, useAdminQuery, useAdminToken } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { adminApi, adminErrorMessage } from "@/lib/admin-api";
import { formatXOF } from "@/lib/format";

export default function AdminProductsPage() {
  const router = useRouter();
  const token = useAdminToken();
  const { data: products, error } = useAdminQuery(adminApi.products);
  const { data: categories } = useAdminQuery(adminApi.categories);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1 className="admin-title">Produits et codes</h1>
        {!creating && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            Nouveau produit
          </button>
        )}
      </div>

      {creating && categories && (
        <section className="surface-card admin-card">
          <div className="admin-head">
            <h2 className="admin-subtitle">Nouveau produit</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
          {formError && <p className="form-error">{formError}</p>}
          <ProductForm
            categories={categories}
            submitLabel="Créer le produit"
            onSubmit={async (input) => {
              setFormError(null);
              try {
                const created = await adminApi.createProduct(token, input);
                router.push(`/admin/produits/${created.publicId}`);
              } catch (err) {
                setFormError(adminErrorMessage(err));
              }
            }}
          />
        </section>
      )}

      {error && <p className="form-error">{error}</p>}
      {!products && !error && <p className="text-muted">Chargement…</p>}
      {products && (
        <div className="surface-card admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Prix</th>
                <th>En stock</th>
                <th>Vendus</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = p.stock.available <= p.lowStockThreshold;
                return (
                  <tr key={p.publicId}>
                    <td>
                      <Link href={`/admin/produits/${p.publicId}`} className="admin-link">
                        {p.name}
                      </Link>
                      <div className="text-muted admin-table__sub">{p.categoryName}</div>
                    </td>
                    <td className="admin-num">{formatXOF(p.saleAmountMinor)}</td>
                    <td className="admin-num">
                      <span className={low ? "admin-low" : undefined}>{p.stock.available}</span>
                    </td>
                    <td className="admin-num">{p.stock.sold}</td>
                    <td>
                      {p.isActive ? <StatusBadge label="Visible" tone="ok" /> : <StatusBadge label="Masqué" tone="neutral" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
