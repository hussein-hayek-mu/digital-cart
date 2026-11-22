"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_PLATFORMS } from "@/lib/platforms";
import { SITE } from "@/lib/site";
import { useAuth } from "./auth-provider";
import { useCart } from "./cart-provider";
import {
  CartIcon,
  ChevronDownIcon,
  CloseIcon,
  MenuIcon,
  OrdersIcon,
  SearchIcon,
  UserIcon,
} from "./icons";
import { Wordmark } from "./wordmark";

const SEARCH_PLACEHOLDER = "Rechercher : PSN 20 $, Steam, Xbox…";

function PlatformsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={ref}>
      <button
        type="button"
        className="site-nav__link"
        aria-expanded={open}
        aria-controls="platforms-menu"
        onClick={() => setOpen((v) => !v)}
      >
        Plateformes
        <ChevronDownIcon size={16} />
      </button>
      <div id="platforms-menu" className={`nav-menu__panel${open ? " is-open" : ""}`}>
        {NAV_PLATFORMS.map((p) => (
          <Link
            key={p.slug}
            href={`/categories/${p.slug}`}
            className="nav-menu__item"
            onClick={() => setOpen(false)}
          >
            <span className="platform-marker" style={{ background: p.color }} aria-hidden="true" />
            {p.name}
          </Link>
        ))}
        <div className="nav-menu__divider" />
        <Link href="/categories" className="nav-menu__item" onClick={() => setOpen(false)}>
          Toutes les plateformes
        </Link>
      </div>
    </div>
  );
}

function OrdersButton() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Link href="/compte/commandes" className="icon-btn header-orders" aria-label="Mes commandes">
      <OrdersIcon />
      <span className="icon-btn__label">Mes commandes</span>
    </Link>
  );
}

function AccountButton() {
  const { user, isLoading } = useAuth();
  const href = user ? "/compte" : "/connexion";
  const label = isLoading ? "Compte" : user ? "Compte" : "Connexion";
  return (
    <Link href={href} className="icon-btn" aria-label={label}>
      <UserIcon />
      <span className="icon-btn__label">{label}</span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const overHero = pathname === "/";
  const isDark = overHero && !scrolled;

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const cartLabel = itemCount > 0 ? `Panier, ${itemCount} article${itemCount > 1 ? "s" : ""}` : "Panier";

  return (
    <>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      {overHero && !SITE.waveLive ? (
        <div className="announcement">
          <div className="container">
            <p>Le paiement Wave en FCFA sera bientôt disponible sur la boutique.</p>
          </div>
        </div>
      ) : null}
      <header className={`site-header${isDark ? " is-dark on-dark" : ""}`}>
        <div className="container">
          <div className="site-header__bar">
            <button
              type="button"
              className="icon-btn header-only-mobile"
              aria-label="Ouvrir le menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
              style={{ marginLeft: -10 }}
            >
              <MenuIcon />
            </button>

            <Link href="/" aria-label={`${SITE.name}, accueil`}>
              <Wordmark />
            </Link>

            <nav className="site-nav" aria-label="Navigation principale">
              <Link href="/produits" className="site-nav__link">
                Toutes les cartes
              </Link>
              <PlatformsMenu />
              <Link href="/#aide" className="site-nav__link">
                Aide
              </Link>
            </nav>

            <form className="header-search" role="search" action="/produits" method="get">
              <label htmlFor="header-search" className="sr-only">
                Rechercher une carte
              </label>
              <SearchIcon size={18} className="header-search__icon" />
              <input id="header-search" name="q" type="search" placeholder={SEARCH_PLACEHOLDER} />
            </form>

            <div className="header-actions">
              <button
                type="button"
                className="icon-btn header-only-mobile"
                aria-label="Rechercher"
                aria-expanded={searchOpen}
                aria-controls="mobile-search"
                onClick={() => setSearchOpen((v) => !v)}
              >
                {searchOpen ? <CloseIcon /> : <SearchIcon />}
              </button>
              <OrdersButton />
              <AccountButton />
              <Link href="/panier" className="icon-btn" aria-label={cartLabel}>
                <CartIcon />
                <span className="icon-btn__label">Panier</span>
                {itemCount > 0 ? (
                  <span className="cart-count" aria-hidden="true">
                    {itemCount > 99 ? "99+" : itemCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>

          {searchOpen ? (
            <div id="mobile-search" className="mobile-search header-only-mobile">
              <form role="search" action="/produits" method="get">
                <label htmlFor="mobile-search-input" className="sr-only">
                  Rechercher une carte
                </label>
                <SearchIcon size={18} className="header-search__icon" />
                <input
                  id="mobile-search-input"
                  name="q"
                  type="search"
                  placeholder={SEARCH_PLACEHOLDER}
                  autoFocus
                />
              </form>
            </div>
          ) : null}
        </div>
      </header>

      <div
        id="mobile-menu"
        className={`mobile-menu header-only-mobile${menuOpen ? " is-open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="mobile-menu__scrim" onClick={() => setMenuOpen(false)} />
        <div
          className="mobile-menu__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="mobile-menu__head">
            <Wordmark />
            <button
              type="button"
              className="icon-btn"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
              tabIndex={menuOpen ? 0 : -1}
            >
              <CloseIcon />
            </button>
          </div>
          <div className="mobile-menu__group">
            {user ? (
              <Link href="/compte/commandes" className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
                <OrdersIcon size={18} />
                Mes commandes
              </Link>
            ) : null}
            <Link href="/produits" className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
              Toutes les cartes
            </Link>
            <Link href="/panier" className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
              Panier{itemCount > 0 ? ` (${itemCount})` : ""}
            </Link>
            {user ? null : (
              <Link href="/commande" className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
                Suivre ma commande
              </Link>
            )}
            <Link href={user ? "/compte" : "/connexion"} className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
              {user ? "Mon compte" : "Connexion"}
            </Link>
          </div>
          <div className="mobile-menu__group">
            <p className="mobile-menu__title">Plateformes</p>
            {NAV_PLATFORMS.map((p) => (
              <Link
                key={p.slug}
                href={`/categories/${p.slug}`}
                className="nav-menu__item"
                tabIndex={menuOpen ? 0 : -1}
              >
                <span className="platform-marker" style={{ background: p.color }} aria-hidden="true" />
                {p.name}
              </Link>
            ))}
          </div>
          <div className="mobile-menu__group" style={{ borderBottom: 0 }}>
            <Link href="/#aide" className="nav-menu__item" tabIndex={menuOpen ? 0 : -1}>
              Aide et contact
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
