import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { GiftCardArt } from "@/components/gift-card-art";
import { getProductBySlug } from "@/lib/api";
import {
  formatFaceValue,
  formatXOF,
  regionLabel,
  stockLabelText,
  stockLabelTone,
} from "@/lib/format";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const tone = stockLabelTone(product.stockLabel);

  return (
    <main className="container page-section">
      <Link
        href={`/categories/${product.categorySlug}`}
        className="text-muted fade-in"
        style={{ fontSize: "0.85rem" }}
      >
        ← {product.categoryName || "Retour"}
      </Link>

      <div
        className="fade-in-delay-1"
        style={{
          marginTop: 24,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          gap: 40,
        }}
      >
        <div className="product-hero-art">
          <GiftCardArt
            platform={product.platform}
            faceValue={product.faceValue}
            faceCurrency={product.faceCurrency}
            region={product.region}
            imageUrl={product.imageUrl}
            alt={product.name}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span className={`badge badge-${tone}`} style={{ alignSelf: "flex-start" }}>
            <span className="badge-dot" />
            {stockLabelText(product.stockLabel)}
          </span>

          <h1 style={{ fontSize: "1.9rem" }}>{product.name}</h1>

          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              fontSize: "0.9rem",
            }}
            className="text-muted"
          >
            <span>
              Plateforme : <strong style={{ color: "var(--color-text)" }}>{product.platform}</strong>
            </span>
            <span>
              Région : <strong style={{ color: "var(--color-text)" }}>{regionLabel(product.region)}</strong>
            </span>
            <span>
              Valeur faciale :{" "}
              <strong style={{ color: "var(--color-text)" }}>
                {formatFaceValue(product.faceValue, product.faceCurrency)}
              </strong>
            </span>
          </div>

          <div
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "2.1rem",
              color: "var(--color-accent)",
            }}
          >
            {formatXOF(product.saleAmountMinor)}
          </div>

          {product.description ? (
            <p className="text-muted" style={{ fontSize: "0.95rem" }}>
              {product.description}
            </p>
          ) : null}

          <AddToCartButton product={product} />

          <div
            className="surface-card"
            style={{
              padding: 16,
              fontSize: "0.85rem",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontWeight: 700 }}>Livraison numérique instantanée</span>
            <span className="text-muted">
              Votre code est délivré dès la confirmation du paiement — aucune expédition
              physique.
            </span>
          </div>

          {product.instructions ? (
            <div>
              <div className="field-label">Instructions d&apos;utilisation</div>
              <p className="text-muted" style={{ fontSize: "0.9rem" }}>
                {product.instructions}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .container > div[class*="fade-in-delay-1"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
