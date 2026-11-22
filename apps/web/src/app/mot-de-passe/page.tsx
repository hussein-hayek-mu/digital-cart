"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function MotDePassePage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <main className="page-section">
        <div className="container" style={{ maxWidth: 520 }}>
          <AuthNotice />
        </div>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/mot-de-passe/nouveau`,
    });

    setLoading(false);
    if (resetError) {
      setError("Impossible d'envoyer l'e-mail de réinitialisation.");
      return;
    }

    setSent(true);
  }

  return (
    <AuthShell
      eyebrow="Espace client"
      title="Mot de passe oublié"
      subtitle="Recevez un lien sécurisé pour définir un nouveau mot de passe."
      footer={
        <Link href="/connexion" className="text-muted" style={{ fontSize: "0.9rem" }}>
          ← Retour à la connexion
        </Link>
      }
    >
      {sent ? (
        <p className="text-muted" style={{ fontSize: "0.95rem" }}>
          Si un compte existe pour <strong>{email}</strong>, un e-mail de réinitialisation vient d&apos;être envoyé.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="email" className="field-label">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? (
            <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Envoi…" : "Envoyer le lien"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
