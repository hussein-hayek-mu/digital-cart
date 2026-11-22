"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ApiError, requestOrderLink } from "@/lib/api";

function LookupForm() {
  const searchParams = useSearchParams();
  const [reference, setReference] = useState(searchParams.get("ref") ?? "");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const ref = reference.trim();
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(ref)) {
      setError("Référence invalide. Elle commence par ORD_ et figure dans votre e-mail de confirmation.");
      return;
    }
    setSubmitting(true);
    try {
      await requestOrderLink(ref, email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Trop de demandes. Patientez 15 minutes puis réessayez."
          : err instanceof ApiError && err.status === 400
            ? "Vérifiez la référence et l’adresse e-mail."
            : "Impossible d’envoyer la demande. Réessayez dans un instant.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="surface-card order-card" role="status">
        <h2 className="order-card__title">Vérifiez votre boîte mail</h2>
        <p className="text-muted">
          Si une commande correspond à ces informations, un lien d’accès vient d’être envoyé à{" "}
          <strong>{email.trim()}</strong>. Il est valable 24 heures. Pensez à vérifier le dossier spam.
        </p>
        <button type="button" className="btn btn-secondary btn-sm order-inline-btn" onClick={() => setSent(false)}>
          Faire une autre demande
        </button>
      </div>
    );
  }

  return (
    <form className="surface-card order-card order-form" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="reference" className="field-label">
          Référence de commande
        </label>
        <input
          id="reference"
          className="input"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="ORD_…"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </div>
      <div>
        <label htmlFor="email" className="field-label">
          Adresse e-mail utilisée pour la commande
        </label>
        <input
          id="email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={submitting || !reference || !email}>
        {submitting ? "Envoi…" : "Recevoir le lien d’accès"}
      </button>
    </form>
  );
}

export default function OrderLookupPage() {
  return (
    <main className="page-section">
      <div className="container order-narrow fade-in">
        <span className="eyebrow">Suivre ma commande</span>
        <h1 className="order-title">Retrouver une commande</h1>
        <p className="text-muted order-lead">
          Indiquez la référence et l’adresse e-mail de votre commande. Nous vous enverrons un lien sécurisé pour la
          consulter et afficher vos codes. Vous avez un compte ?{" "}
          <Link href="/compte">Vos commandes sont dans votre espace</Link>.
        </p>
        <Suspense fallback={null}>
          <LookupForm />
        </Suspense>
      </div>
    </main>
  );
}
