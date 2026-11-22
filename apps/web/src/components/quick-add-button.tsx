"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProduct } from "@/lib/api";
import { useCart } from "./cart-provider";
import { CheckIcon } from "./icons";

export function QuickAddButton({ product }: { product: PublicProduct }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unavailable = product.stockLabel === "out_of_stock";

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleAdd() {
    if (unavailable) return;
    addItem({
      productPublicId: product.publicId,
      slug: product.slug,
      name: product.name,
      platform: product.platform,
      region: product.region,
      faceValue: product.faceValue,
      faceCurrency: product.faceCurrency,
      imageUrl: product.imageUrl,
      unitAmountMinor: product.saleAmountMinor,
    });
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 1800);
  }

  if (unavailable) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" disabled>
        Indisponible
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={handleAdd}
        aria-label={added ? `${product.name} ajouté au panier` : `Ajouter ${product.name} au panier`}
      >
        {added ? (
          <>
            <CheckIcon size={16} />
            Ajouté
          </>
        ) : (
          "Ajouter"
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {added ? `${product.name} ajouté au panier` : ""}
      </span>
    </>
  );
}
