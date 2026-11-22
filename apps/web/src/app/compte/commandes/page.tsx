"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { useAuth } from "@/components/auth-provider";
import { OrderList } from "@/components/order-list";
import { ApiError } from "@/lib/api";
import { getMyOrders, type OrderSummary } from "@/lib/auth-api";

export default function MyOrdersPage() {
  const router = useRouter();
  const { user, accessToken, isLoading, isConfigured } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured || isLoading) return;
    if (!user || !accessToken) {
      router.replace("/connexion");
      return;
    }
    let cancelled = false;
    getMyOrders(accessToken)
      .then((data) => {
        if (!cancelled) setOrders(data.orders);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 401
            ? "Votre session a expiré. Reconnectez-vous pour voir vos commandes."
            : "Impossible de charger vos commandes. Réessayez dans un instant.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isConfigured, isLoading, user, accessToken, router]);

  if (!isConfigured) {
    return (
      <main className="page-section">
        <div className="container order-narrow">
          <AuthNotice />
        </div>
      </main>
    );
  }

  return (
    <main className="page-section">
      <div className="container order-page fade-in">
        <div>
          <span className="eyebrow">Mon compte</span>
          <h1 className="order-title">Mes commandes</h1>
          <p className="text-muted order-lead">Ouvrez une commande pour afficher vos codes.</p>
        </div>

        <section className="surface-card order-card" aria-label="Liste des commandes">
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : orders === null ? (
            <p className="text-muted">Chargement…</p>
          ) : orders.length === 0 ? (
            <div>
              <p className="text-muted">Vous n’avez pas encore passé de commande.</p>
              <Link href="/produits" className="btn btn-primary btn-sm order-inline-btn">
                Parcourir les cartes
              </Link>
            </div>
          ) : (
            <OrderList orders={orders} />
          )}
        </section>

        <p className="text-muted order-help">
          Une commande passée sans être connecté ? <Link href="/commande">Retrouvez-la ici</Link>.
        </p>
      </div>
    </main>
  );
}
