import { ProductCard } from "@/components/product-card";
import { getCategories, getProducts } from "@/lib/api";

export const metadata = {
  title: "Produits — Mahdi's Store",
};

export default async function ProduitsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const params = await searchParams;
  const category = params.category ?? "";
  const q = params.q ?? "";

  const [categories, products] = await Promise.all([
    getCategories().catch(() => []),
    getProducts({ category: category || undefined, q: q || undefined }).catch(() => []),
  ]);

  return (
    <main className="container page-section">
      <div className="fade-in" style={{ marginBottom: 28 }}>
        <span className="eyebrow">Catalogue</span>
        <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Tous les produits</h1>
        <p className="text-muted" style={{ marginTop: 8 }}>
          Recherchez par nom, plateforme ou région, ou filtrez par catégorie.
        </p>
      </div>

      <form
        method="get"
        className="surface-card fade-in-delay-1"
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          padding: 20,
          marginBottom: 32,
          alignItems: "flex-end",
        }}
      >
        <div style={{ flex: "1 1 220px" }}>
          <label className="field-label" htmlFor="q">
            Rechercher
          </label>
          <input
            id="q"
            name="q"
            className="input"
            type="text"
            placeholder="Ex : PlayStation, Steam, US…"
            defaultValue={q}
          />
        </div>

        <div style={{ flex: "1 1 200px" }}>
          <label className="field-label" htmlFor="category">
            Catégorie
          </label>
          <select id="category" name="category" className="select" defaultValue={category}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.publicId} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary">
          Filtrer
        </button>
      </form>

      {products.length === 0 ? (
        <p className="text-muted">Aucun produit ne correspond à votre recherche.</p>
      ) : (
        <div className="grid-products fade-in-delay-2">
          {products.map((product) => (
            <ProductCard key={product.publicId} product={product} />
          ))}
        </div>
      )}
    </main>
  );
}
