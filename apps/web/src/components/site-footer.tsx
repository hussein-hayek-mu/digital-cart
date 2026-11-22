import Link from "next/link";
import { NAV_PLATFORMS } from "@/lib/platforms";
import { SITE } from "@/lib/site";
import { ChevronDownIcon } from "./icons";
import { Wordmark } from "./wordmark";

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Boutique",
    links: [
      { href: "/produits", label: "Toutes les cartes" },
      ...NAV_PLATFORMS.map((p) => ({ href: `/categories/${p.slug}`, label: p.name })),
    ],
  },
  {
    title: "Aide",
    links: [
      { href: "/#comment-ca-marche", label: "Comment ça marche" },
      { href: "/commande", label: "Suivre ma commande" },
      { href: "/#aide", label: "Contacter le support" },
      { href: "/compte", label: "Mon compte" },
    ],
  },
  {
    title: "Légal",
    links: [
      { href: "/conditions", label: "Conditions de vente" },
      { href: "/remboursement", label: "Politique de remboursement" },
      { href: "/confidentialite", label: "Confidentialité" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer on-dark">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Wordmark />
            <p>
              Cartes cadeaux numériques PlayStation, Steam, Xbox, Nintendo, Roblox et plus,
              payées en FCFA et disponibles en ligne dès le paiement confirmé.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <details key={col.title} className="footer-col" open>
              <summary>
                {col.title}
                <ChevronDownIcon size={18} />
              </summary>
              <ul>
                {col.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <div className="site-footer__bottom">
          <p>
            © {new Date().getFullYear()} {SITE.name}
            {SITE.waveLive ? " · Paiement par Wave" : ""}
          </p>
          <p className="site-footer__legal">
            {SITE.name} est un revendeur indépendant, non affilié à Sony Interactive
            Entertainment, Microsoft, Valve, Nintendo, Roblox, Apple ou Google. Les marques
            citées appartiennent à leurs propriétaires respectifs.
          </p>
        </div>
      </div>
    </footer>
  );
}
