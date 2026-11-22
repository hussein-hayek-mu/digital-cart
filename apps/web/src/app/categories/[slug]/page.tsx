import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/product-card";
import { getCategoryBySlug } from "@/lib/api";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getCategoryBySlug(slug);

  if (!result) {
    notFound();
  }

  const { category, products } = result;

  return (
    <main className="container page-section">
      <div className="fade-in" style={{ marginBottom: 32 }}>
        <Link href="/categories" className="text-muted" style={{ fontSize: "0.85rem" }}>
          ← Toutes les catégories
        </Link>
        <h1 style={{ fontSize: "2rem", marginTop: 14 }}>{category.name}</h1>
        {category.description ? (
          <p className="text-muted" style={{ marginTop: 8, maxWidth: 620 }}>
            {category.description}
          </p>
        ) : null}
      </div>

      {products.length === 0 ? (
        <p className="text-muted">Aucun produit disponible dans cette catégorie pour le moment.</p>
      ) : (
        <div className="grid-products fade-in-delay-1">
          {products.map((product) => (
            <ProductCard key={product.publicId} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
