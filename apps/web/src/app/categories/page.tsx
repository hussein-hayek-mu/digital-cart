import Link from "next/link";
import { getCategories } from "@/lib/api";

export const metadata = {
  title: "Catégories — Mahdi's Store",
};

export default async function CategoriesPage() {
  const categories = await getCategories().catch(() => []);

  return (
    <main className="container page-section">
      <div className="fade-in" style={{ marginBottom: 32 }}>
        <span className="eyebrow">Catalogue</span>
        <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Catégories</h1>
        <p className="text-muted" style={{ marginTop: 8 }}>
          Choisissez une catégorie pour découvrir les cartes disponibles.
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="text-muted">Aucune catégorie disponible pour le moment.</p>
      ) : (
        <div className="grid-categories fade-in-delay-1">
          {categories.map((category) => (
            <Link
              key={category.publicId}
              href={`/categories/${category.slug}`}
              className="surface-card"
              style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }}
            >
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.15rem" }}>
                {category.name}
              </span>
              {category.description ? (
                <span className="text-muted" style={{ fontSize: "0.9rem" }}>
                  {category.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
