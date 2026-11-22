import Link from "next/link";
import type { PublicProduct } from "@/lib/api";
import { formatFaceValue, formatXOF, regionLabel, stockLabelText } from "@/lib/format";
import { platformColor } from "@/lib/platforms";
import { GiftCardArt } from "./gift-card-art";
import { QuickAddButton } from "./quick-add-button";

const STOCK_CLASS = {
  in_stock: "stock-ok",
  low_stock: "stock-warn",
  out_of_stock: "stock-out",
} as const;

export function ProductCard({ product }: { product: PublicProduct }) {
  const href = `/produits/${product.slug}`;
  const isOut = product.stockLabel === "out_of_stock";

  return (
    <article className={`product-card${isOut ? " is-out" : ""}`}>
      <Link href={href} className="product-card__media" tabIndex={-1} aria-hidden="true">
        <GiftCardArt
          platform={product.platform}
          faceValue={product.faceValue}
          faceCurrency={product.faceCurrency}
          region={product.region}
          imageUrl={product.imageUrl}
          alt={product.name}
        />
      </Link>

      <div className="product-card__body">
        <div className="product-card__meta">
          <span className="product-card__platform">
            <span className="platform-marker" style={{ background: platformColor(product.platform) }} aria-hidden="true" />
            {product.platform}
          </span>
          <span className="region-tag">
            <span className="sr-only">Région : </span>
            {regionLabel(product.region)}
          </span>
        </div>

        <h3 className="product-card__title">
          <Link href={href}>{product.name}</Link>
        </h3>
        <p className="product-card__face">
          Valeur faciale : {formatFaceValue(product.faceValue, product.faceCurrency)}
        </p>

        <p className="product-card__price">
          <span className="sr-only">Prix : </span>
          <span className="t-price">{formatXOF(product.saleAmountMinor)}</span>
        </p>

        <div className="product-card__footer">
          <span className={`stock ${STOCK_CLASS[product.stockLabel]}`}>
            <span className="stock-dot" aria-hidden="true" />
            {stockLabelText(product.stockLabel)}
          </span>
          <QuickAddButton product={product} />
        </div>
      </div>
    </article>
  );
}
