"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { GiftCardArt } from "@/components/gift-card-art";
import {
  ApiError,
  getOrderDetails,
  revealOrderCodes,
  type OrderCredentials,
  type OrderDetails,
  type RevealedCode,
} from "@/lib/api";
import { formatFaceValue, formatXOF, orderStatusLabel, orderStatusTone, regionLabel } from "@/lib/format";
import { getOrderAccessToken, saveOrderAccessToken, takeTokenFromUrlFragment } from "@/lib/order-access";

const PENDING = new Set(["pending_payment", "payment_processing", "paid"]);
const POLL_MS = 3000;

type LoadState =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error"; message: string }
  | { kind: "ready"; order: OrderDetails };

export default function OrderPage() {
  const params = useParams<{ ref: string }>();
  const publicRef = decodeURIComponent(params.ref);
  const { accessToken: bearerToken, isLoading: authLoading } = useAuth();

  const [credentials, setCredentials] = useState<OrderCredentials | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [codes, setCodes] = useState<RevealedCode[] | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const tokenRead = useRef(false);

  useEffect(() => {
    if (authLoading) return;
    if (!tokenRead.current) {
      tokenRead.current = true;
      const fromLink = takeTokenFromUrlFragment();
      if (fromLink) saveOrderAccessToken(publicRef, fromLink);
    }
    setCredentials({ accessToken: getOrderAccessToken(publicRef), bearerToken });
  }, [authLoading, bearerToken, publicRef]);

  const load = useCallback(async () => {
    if (!credentials) return null;
    if (!credentials.accessToken && !credentials.bearerToken) {
      setState({ kind: "denied" });
      return null;
    }
    try {
      const order = await getOrderDetails(publicRef, credentials);
      setState({ kind: "ready", order });
      return order;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState({ kind: "denied" });
      else if (err instanceof ApiError && err.status === 429)
        setState({ kind: "error", message: "Trop de tentatives. Patientez quelques minutes puis réessayez." });
      else setState({ kind: "error", message: "Impossible de charger la commande. Réessayez dans un instant." });
      return null;
    }
  }, [credentials, publicRef]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      const order = await load();
      if (!cancelled && order && PENDING.has(order.status)) timer = setTimeout(run, POLL_MS);
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  async function handleReveal() {
    if (!credentials) return;
    setRevealing(true);
    setRevealError(null);
    try {
      const result = await revealOrderCodes(publicRef, credentials);
      setCodes(result.codes);
    } catch (err) {
      setRevealError(
        err instanceof ApiError && err.status === 429
          ? "Trop de tentatives. Patientez quelques minutes puis réessayez."
          : "Impossible d’afficher les codes. Réessayez dans un instant.",
      );
    } finally {
      setRevealing(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="page-section">
        <div className="container text-muted">Chargement de la commande…</div>
      </main>
    );
  }

  if (state.kind === "denied") {
    return (
      <main className="page-section">
        <div className="container order-narrow fade-in">
          <span className="eyebrow">Commande</span>
          <h1 className="order-title">Accès à la commande</h1>
          <p className="text-muted order-lead">
            Pour protéger vos codes, cette commande ne s’ouvre qu’avec le lien reçu par e-mail ou depuis le
            compte qui l’a passée.
          </p>
          <div className="order-actions">
            <Link href={`/commande?ref=${encodeURIComponent(publicRef)}`} className="btn btn-primary">
              Recevoir un lien par e-mail
            </Link>
            <Link href="/connexion" className="btn btn-secondary">
              Se connecter
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page-section">
        <div className="container order-narrow fade-in">
          <h1 className="order-title">Commande indisponible</h1>
          <p className="text-muted order-lead">{state.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            Réessayer
          </button>
        </div>
      </main>
    );
  }

  const { order } = state;
  const tone = orderStatusTone(order.status);

  return (
    <main className="page-section">
      <div className="container order-page fade-in">
        <header className="order-head">
          <div>
            <span className="eyebrow">Commande</span>
            <h1 className="order-title">{order.publicReference}</h1>
            <p className="text-muted">
              Passée le{" "}
              {new Date(order.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}{" "}
              · {formatXOF(order.totalAmountMinor)}
            </p>
          </div>
          <span className={`badge ${tone === "neutral" ? "" : `badge-${tone}`}`}>
            <span className="badge-dot" />
            {orderStatusLabel(order.status)}
          </span>
        </header>

        <section className="surface-card order-card" aria-labelledby="codes-title">
          <h2 id="codes-title" className="order-card__title">
            Vos codes
          </h2>
          <CodesSection
            order={order}
            codes={codes}
            revealing={revealing}
            revealError={revealError}
            onReveal={handleReveal}
          />
        </section>

        <section className="surface-card order-card" aria-labelledby="items-title">
          <h2 id="items-title" className="order-card__title">
            Articles
          </h2>
          <ul className="order-items">
            {order.items.map((item) => (
              <li key={item.productPublicId} className="order-item">
                <div className="order-item__art">
                  <GiftCardArt
                    variant="thumb"
                    platform={item.platform}
                    faceValue={item.faceValue}
                    faceCurrency={item.faceCurrency}
                    region={item.region}
                  />
                </div>
                <div className="order-item__body">
                  <p className="order-item__name">{item.name}</p>
                  <p className="text-muted order-item__meta">
                    {formatFaceValue(item.faceValue, item.faceCurrency)} · {regionLabel(item.region)} · Qté{" "}
                    {item.quantity}
                  </p>
                </div>
                <p className="order-item__price">{formatXOF(item.totalAmountMinor)}</p>
              </li>
            ))}
          </ul>
          <div className="order-total">
            <span>Total payé</span>
            <strong>{formatXOF(order.totalAmountMinor)}</strong>
          </div>
        </section>

        <p className="text-muted order-help">
          Un problème avec un code ? <Link href="/#aide">Contactez le support</Link> en indiquant la référence{" "}
          {order.publicReference}.
        </p>
      </div>
    </main>
  );
}

function CodesSection({
  order,
  codes,
  revealing,
  revealError,
  onReveal,
}: {
  order: OrderDetails;
  codes: RevealedCode[] | null;
  revealing: boolean;
  revealError: string | null;
  onReveal: () => void;
}) {
  if (PENDING.has(order.status)) {
    return (
      <p className="text-muted">
        Paiement en cours de confirmation. Cette page se met à jour automatiquement ; vos codes apparaîtront ici dès
        que le paiement sera validé.
      </p>
    );
  }
  if (order.status === "manual_review") {
    return (
      <p className="text-muted">
        Votre paiement est reçu, mais la commande nécessite une vérification manuelle. Vous recevrez un e-mail dès que
        vos codes seront disponibles, ou un remboursement si la livraison est impossible.
      </p>
    );
  }
  if (order.status === "payment_failed" || order.status === "expired" || order.status === "cancelled") {
    return (
      <div>
        <p className="text-muted">Cette commande n’a pas été payée. Aucun montant n’a été prélevé.</p>
        <Link href="/panier" className="btn btn-secondary btn-sm order-inline-btn">
          Retour au panier
        </Link>
      </div>
    );
  }
  if (order.status !== "fulfilled") {
    return <p className="text-muted">{orderStatusLabel(order.status)}.</p>;
  }

  if (!codes) {
    return (
      <div className="code-gate">
        <p>
          {order.codesAvailable > 1
            ? `${order.codesAvailable} codes sont prêts. Affichez-les uniquement lorsque vous êtes prêt à les utiliser, et ne les partagez avec personne.`
            : "Votre code est prêt. Affichez-le uniquement lorsque vous êtes prêt à l’utiliser, et ne le partagez avec personne."}
        </p>
        {revealError ? <p className="form-error">{revealError}</p> : null}
        <button type="button" className="btn btn-primary" onClick={onReveal} disabled={revealing}>
          {revealing ? "Affichage…" : order.codesAvailable > 1 ? "Afficher mes codes" : "Afficher mon code"}
        </button>
      </div>
    );
  }

  return (
    <ul className="code-list">
      {codes.map((c) => (
        <li key={c.fulfilmentId} className="code-card">
          <p className="code-card__product">{c.productName}</p>
          <div className="code-card__row">
            <code className="code-card__value">{c.code}</code>
            <CopyButton value={c.code} />
          </div>
          {c.instructions ? <p className="text-muted code-card__help">{c.instructions}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the code stays selectable.
    }
  }
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
      <span aria-live="polite">{copied ? "Copié" : "Copier"}</span>
    </button>
  );
}
