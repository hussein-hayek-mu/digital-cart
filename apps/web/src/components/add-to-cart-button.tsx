"use client";

import { useState } from "react";
import type { PublicProduct } from "@/lib/api";
import { useCart } from "./cart-provider";

export function AddToCartButton({ product }: { product: PublicProduct }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const disabled = product.stockLabel === "out_of_stock";

  function handleAdd() {
    if (disabled) return;
    addItem(
      {
        productPublicId: product.publicId,
        slug: product.slug,
        name: product.name,
        platform: product.platform,
        region: product.region,
        faceValue: product.faceValue,
        faceCurrency: product.faceCurrency,
        imageUrl: product.imageUrl,
        unitAmountMinor: product.saleAmountMinor,
      },
      quantity,
    );
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label className="field-label" style={{ margin: 0 }} htmlFor="quantity">
          Quantité
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Diminuer la quantité"
          >
            −
          </button>
          <span id="quantity" style={{ minWidth: 32, textAlign: "center", fontWeight: 600 }}>
            {quantity}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setQuantity((q) => Math.min(20, q + 1))}
            aria-label="Augmenter la quantité"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={handleAdd}
        disabled={disabled}
      >
        {disabled ? "Rupture de stock" : justAdded ? "Ajouté ✓" : "Ajouter au panier"}
      </button>
    </div>
  );
}
