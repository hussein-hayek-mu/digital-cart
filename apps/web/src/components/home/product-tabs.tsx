"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import type { PublicProduct } from "@/lib/api";
import { ProductCard } from "../product-card";

const ALL = "__all";

export function ProductTabs({ products, limit = 8 }: { products: PublicProduct[]; limit?: number }) {
  const baseId = useId();
  const platforms = useMemo(
    () => Array.from(new Set(products.map((p) => p.platform))).slice(0, 4),
    [products],
  );
  const tabs = [ALL, ...platforms];
  const [active, setActive] = useState(ALL);

  const visible = (active === ALL ? products : products.filter((p) => p.platform === active)).slice(0, limit);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setActive(tabs[next]!);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Filtrer par plateforme">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            id={`${baseId}-tab-${i}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={active === tab}
            aria-controls={`${baseId}-panel`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => setActive(tab)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {tab === ALL ? "Toutes" : tab}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" className="grid-products">
        {visible.map((product) => (
          <ProductCard key={product.publicId} product={product} />
        ))}
      </div>
    </>
  );
}
