"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { adminApi, adminErrorMessage } from "@/lib/admin-api";

const AdminTokenContext = createContext<string | null>(null);

export function useAdminToken(): string {
  const token = useContext(AdminTokenContext);
  if (!token) throw new Error("useAdminToken must be used inside AdminShell");
  return token;
}

/** Loads admin data with the current session; `reload()` refetches after an action. */
export function useAdminQuery<T>(fetcher: (token: string) => Promise<T>, deps: unknown[] = []) {
  const token = useAdminToken();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetcher(token)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(adminErrorMessage(err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, version, ...deps]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload, setData };
}

const NAV = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/produits", label: "Produits et codes" },
  { href: "/admin/commandes", label: "Commandes" },
  { href: "/admin/journal", label: "Journal" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, isLoading, isConfigured } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "forbidden" | "error">("checking");

  useEffect(() => {
    if (!isConfigured || isLoading) return;
    if (!user || !accessToken) {
      router.replace("/connexion");
      return;
    }
    let cancelled = false;
    adminApi
      .me(accessToken)
      .then(() => !cancelled && setState("ok"))
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof ApiError && (err.status === 403 || err.status === 401) ? "forbidden" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [isConfigured, isLoading, user, accessToken, router]);

  if (state !== "ok" || !accessToken) {
    return (
      <main className="page-section">
        <div className="container order-narrow">
          <section className="surface-card order-card">
            {state === "checking" ? (
              <p className="text-muted">Vérification de l’accès…</p>
            ) : (
              <>
                <h1 className="order-title">Espace admin</h1>
                <p className="form-error" role="alert">
                  {state === "forbidden"
                    ? adminErrorMessage({ code: "FORBIDDEN" })
                    : "Impossible de vérifier l’accès. Réessayez dans un instant."}
                </p>
                <Link href="/" className="btn btn-secondary btn-sm order-inline-btn">
                  Retour à la boutique
                </Link>
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <AdminTokenContext.Provider value={accessToken}>
      <main className="page-section admin">
        <div className="container admin__layout">
          <nav className="admin-nav" aria-label="Espace admin">
            <span className="eyebrow">Espace admin</span>
            <ul>
              {NAV.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className="admin-nav__link" aria-current={active ? "page" : undefined}>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="admin__content">{children}</div>
        </div>
      </main>
    </AdminTokenContext.Provider>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: "ok" | "warn" | "danger" | "neutral" }) {
  return (
    <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`}`}>
      <span className="badge-dot" />
      {label}
    </span>
  );
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
