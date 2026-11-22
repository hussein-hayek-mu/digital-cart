import Link from "next/link";
import { GiftCardArt } from "@/components/gift-card-art";
import { ProductTabs } from "@/components/home/product-tabs";
import { Reveal } from "@/components/home/reveal";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { getCategories, getProducts, type PublicProduct } from "@/lib/api";
import { platformColor } from "@/lib/platforms";
import { SITE } from "@/lib/site";

type HeroCard = Pick<PublicProduct, "platform" | "faceValue" | "faceCurrency" | "region" | "imageUrl">;

const HERO_FALLBACK: HeroCard[] = [
  { platform: "PlayStation", faceValue: "50", faceCurrency: "USD", region: "US", imageUrl: null },
  { platform: "Steam", faceValue: "20", faceCurrency: "USD", region: "Global", imageUrl: null },
  { platform: "Xbox", faceValue: "25", faceCurrency: "USD", region: "US", imageUrl: null },
];

function pickHeroCards(products: PublicProduct[]): HeroCard[] {
  const wanted = ["psn-50-us", "steam-20-global", "xbox-25-us"];
  const picked = wanted
    .map((slug) => products.find((p) => p.slug === slug))
    .filter((p): p is PublicProduct => Boolean(p));
  return picked.length === 3 ? picked : HERO_FALLBACK;
}

function cardCountLabel(count: number): string {
  return count === 1 ? "1 carte" : `${count} cartes`;
}

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getCategories().catch(() => []),
    getProducts().catch(() => []),
  ]);

  const available = products.filter((p) => p.stockLabel !== "out_of_stock");
  const selection = available.length > 0 ? available : products;
  const heroCards = pickHeroCards(products);

  const countBySlug = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.categorySlug] = (acc[p.categorySlug] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main>
      {/* Hero */}
      <section className="hero on-dark" aria-labelledby="hero-title">
        <div className="container">
          <div className="hero__inner">
            <div className="hero__copy">
              <h1 id="hero-title" className="t-display hero__title">
                Cartes cadeaux gaming, livrées dès votre paiement confirmé.
              </h1>
              <p className="hero__lead">
                PSN, Steam, Xbox, Nintendo, Roblox et plus.{" "}
                {SITE.waveLive ? "Payez en FCFA avec Wave. " : "Prix affichés en FCFA. "}
                Votre code s’affiche sur une page sécurisée, et un lien d’accès vous est envoyé par e-mail.
              </p>
              <div className="hero__actions">
                <Link href="/produits" className="btn btn-primary">
                  Voir les cartes
                </Link>
                <Link href="#comment-ca-marche" className="link-arrow">
                  Comment ça marche
                  <ArrowRightIcon size={16} />
                </Link>
              </div>
              <ul className="hero__facts" aria-label="Garanties">
                <li>{SITE.waveLive ? "Paiement sécurisé Wave" : "Prix en FCFA"}</li>
                <li>Livraison numérique</li>
                <li>Région indiquée sur chaque carte</li>
              </ul>
            </div>

            <div className="hero__stage" aria-hidden="true">
              <div className="hero__panel" />
              <div className="hero__cards">
                {heroCards.map((card, i) => (
                  <div key={card.platform + card.faceValue} className={`hero__card hero__card--${i + 1}`}>
                    <GiftCardArt {...card} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      {categories.length > 0 ? (
        <section className="section-tight" aria-labelledby="platforms-title">
          <div className="container">
            <Reveal>
              <div className="section-head">
                <h2 id="platforms-title" className="t-section">
                  Choisir une plateforme
                </h2>
                <Link href="/categories" className="link-arrow">
                  Toutes les plateformes
                  <ArrowRightIcon size={16} />
                </Link>
              </div>
              <div className="platform-tiles">
                {categories.map((category) => (
                  <Link
                    key={category.publicId}
                    href={`/categories/${category.slug}`}
                    className="platform-tile"
                  >
                    <span
                      className="platform-tile__marker"
                      style={{ background: platformColor(category.slug) }}
                      aria-hidden="true"
                    />
                    <span className="platform-tile__name">{category.name}</span>
                    <span className="platform-tile__meta">
                      {cardCountLabel(countBySlug[category.slug] ?? 0)}
                      <ArrowRightIcon size={16} />
                    </span>
                  </Link>
                ))}
              </div>
            </Reveal>
          </div>
        </section>
      ) : null}

      {/* Selection */}
      <section className="section-tight" aria-labelledby="selection-title">
        <div className="container">
          <Reveal>
            <div className="section-head">
              <h2 id="selection-title" className="t-section">
                Notre sélection
              </h2>
              <Link href="/produits" className="link-arrow">
                Toutes les cartes
                <ArrowRightIcon size={16} />
              </Link>
            </div>
            {selection.length > 0 ? (
              <ProductTabs products={selection} />
            ) : (
              <p className="empty-state">
                Le catalogue est momentanément indisponible. Réessayez dans quelques instants.
              </p>
            )}
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="comment-ca-marche" className="section section-white" aria-labelledby="how-title">
        <div className="container">
          <Reveal className="steps">
            <div className="steps__intro">
              <h2 id="how-title" className="t-section">
                Comment ça marche
              </h2>
              <p>Trois étapes, sans création de compte obligatoire.</p>
            </div>
            <ol className="steps__list">
              <li className="steps__item">
                <span className="steps__num" aria-hidden="true">1</span>
                <div>
                  <h3 className="steps__title">Choisissez votre carte</h3>
                  <p className="steps__text">
                    Vérifiez la région : elle doit correspondre à celle de votre compte de jeu.
                  </p>
                </div>
              </li>
              <li className="steps__item">
                <span className="steps__num" aria-hidden="true">2</span>
                <div>
                  <h3 className="steps__title">Payez en FCFA avec Wave</h3>
                  <p className="steps__text">
                    Le paiement se fait sur Wave. Nous ne voyons jamais votre code secret Wave.
                  </p>
                </div>
              </li>
              <li className="steps__item">
                <span className="steps__num" aria-hidden="true">3</span>
                <div>
                  <h3 className="steps__title">Recevez votre code</h3>
                  <p className="steps__text">
                    Par e-mail et dans « Mes commandes », dès que Wave confirme le paiement.
                  </p>
                </div>
              </li>
            </ol>
          </Reveal>
        </div>
      </section>

      {/* Trust & payment */}
      <section className="section section-blue" aria-label="Paiement et livraison">
        <div className="container">
          <Reveal className="trust">
            <div className="trust__col">
              <h3>Paiement sécurisé avec Wave{SITE.waveLive ? "" : " (bientôt disponible)"}</h3>
              <p>Vous payez directement dans Wave, l’application que vous utilisez déjà.</p>
              <ul className="trust__list">
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Redirection vers Wave</strong> pour confirmer le montant en FCFA.
                  </span>
                </li>
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Commande validée</strong> uniquement après la confirmation de Wave.
                  </span>
                </li>
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Aucun code secret</strong> ni donnée Wave n’est stocké chez nous.
                  </span>
                </li>
              </ul>
            </div>
            <div className="trust__col">
              <h3>Livraison et région</h3>
              <p>Des cartes numériques, sans envoi physique ni délai de transport.</p>
              <ul className="trust__list">
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Code livré</strong> sur une page sécurisée de votre commande, accessible par lien e-mail.
                  </span>
                </li>
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Région affichée</strong> sur chaque carte, avant l’achat.
                  </span>
                </li>
                <li>
                  <CheckIcon />
                  <span>
                    <strong>Produit numérique :</strong> un code révélé ne peut pas être remboursé.
                  </span>
                </li>
              </ul>
              <Link href="/remboursement" className="link-arrow">
                Politique de remboursement
                <ArrowRightIcon size={16} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Support */}
      <section id="aide" aria-labelledby="support-title">
        <div className="container">
          <div className="support">
            <div className="support__lead">
              <h2 id="support-title" className="t-section">
                Un problème avec un code ?
              </h2>
              <p>Notre équipe à Abidjan vous répond, {SITE.support.hours}.</p>
            </div>
            <ul className="support__channels">
              <li>
                <span className="support__label">WhatsApp</span>
                <span className="support__value">
                  <a href={SITE.support.whatsappHref} rel="noopener noreferrer" target="_blank">
                    {SITE.support.whatsappDisplay}
                  </a>
                </span>
              </li>
              <li>
                <span className="support__label">E-mail</span>
                <span className="support__value">
                  <a href={`mailto:${SITE.support.email}`}>{SITE.support.email}</a>
                </span>
              </li>
              <li>
                <span className="support__label">Suivi de commande</span>
                <span className="support__value">
                  <Link href="/compte">Mes commandes</Link>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
