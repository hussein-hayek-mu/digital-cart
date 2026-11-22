"use client";

import { useState, type FormEvent } from "react";
import type { AdminCategory, AdminProduct, ProductInput } from "@/lib/admin-api";

type Props = {
  categories: AdminCategory[];
  initial?: AdminProduct;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<void>;
};

export function ProductForm({ categories, initial, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? "",
    platform: initial?.platform ?? "",
    region: initial?.region ?? "",
    faceValue: initial?.faceValue ?? "",
    faceCurrency: initial?.faceCurrency ?? "USD",
    price: initial ? String(initial.saleAmountMinor) : "",
    lowStockThreshold: String(initial?.lowStockThreshold ?? 3),
    isActive: initial?.isActive ?? true,
    description: initial?.description ?? "",
    instructions: initial?.instructions ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        categoryId: form.categoryId,
        platform: form.platform.trim(),
        region: form.region.trim(),
        faceValue: form.faceValue.trim().replace(",", "."),
        faceCurrency: form.faceCurrency.trim(),
        saleAmountMinor: Number(form.price.replace(/\s/g, "")),
        lowStockThreshold: Number(form.lowStockThreshold),
        isActive: form.isActive,
        description: form.description.trim() || null,
        instructions: form.instructions.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <label className="admin-form__wide">
        <span className="field-label">Nom du produit</span>
        <input className="input" required maxLength={120} value={form.name} onChange={set("name")} />
      </label>
      <label>
        <span className="field-label">Catégorie</span>
        <select className="input" value={form.categoryId} onChange={set("categoryId")}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="field-label">Prix de vente (FCFA)</span>
        <input
          className="input"
          required
          inputMode="numeric"
          pattern="[0-9 ]+"
          value={form.price}
          onChange={set("price")}
        />
      </label>
      <label>
        <span className="field-label">Plateforme</span>
        <input className="input" required placeholder="PlayStation" value={form.platform} onChange={set("platform")} />
      </label>
      <label>
        <span className="field-label">Région</span>
        <input className="input" required placeholder="US, EU, Global…" value={form.region} onChange={set("region")} />
      </label>
      <label>
        <span className="field-label">Valeur de la carte</span>
        <input className="input" required inputMode="decimal" placeholder="20" value={form.faceValue} onChange={set("faceValue")} />
      </label>
      <label>
        <span className="field-label">Devise de la carte</span>
        <input className="input" required placeholder="USD, EUR, Robux…" value={form.faceCurrency} onChange={set("faceCurrency")} />
      </label>
      <label>
        <span className="field-label">Alerte stock bas à partir de</span>
        <input
          className="input"
          type="number"
          min={0}
          max={1000}
          value={form.lowStockThreshold}
          onChange={set("lowStockThreshold")}
        />
      </label>
      <label className="admin-form__check">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
        />
        <span>Visible dans la boutique</span>
      </label>
      <label className="admin-form__wide">
        <span className="field-label">Description</span>
        <textarea className="input" rows={3} maxLength={2000} value={form.description} onChange={set("description")} />
      </label>
      <label className="admin-form__wide">
        <span className="field-label">Instructions d’utilisation</span>
        <textarea className="input" rows={4} maxLength={4000} value={form.instructions} onChange={set("instructions")} />
      </label>
      <div className="admin-form__wide">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
