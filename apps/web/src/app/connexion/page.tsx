"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function ConnexionPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(new URLSearchParams(window.location.search).get("confirme") === "1");
  }, []);

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
    setUnconfirmed(false);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    if (signInError) {
      const notConfirmed =
        signInError.code === "email_not_confirmed" ||
        signInError.message.toLowerCase().includes("not confirmed");
      setUnconfirmed(notConfirmed);
      setError(
        notConfirmed
          ? "Votre adresse e-mail n’est pas encore confirmée."
          : "Adresse e-mail ou mot de passe incorrect.",
      );
      return;
    }

    router.push("/compte");
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Espace client"
      title="Connexion"
      subtitle="Accédez à votre compte pour gérer votre profil et vos commandes."
      footer={
        <p className="text-muted" style={{ fontSize: "0.9rem" }}>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="text-accent">
            Créer un compte
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {confirmed ? (
          <p className="badge badge-ok" role="status" style={{ fontSize: 14, padding: "8px 12px" }}>
            Adresse e-mail confirmée. Vous pouvez vous connecter.
          </p>
        ) : null}
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
        <div>
          <label htmlFor="password" className="field-label">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>
            {error}{" "}
            {unconfirmed ? (
              <Link href={`/verification?email=${encodeURIComponent(email.trim())}`} className="text-accent">
                Renvoyer l’e-mail de confirmation
              </Link>
            ) : null}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <Link href="/mot-de-passe" className="text-muted" style={{ fontSize: "0.85rem", textAlign: "center" }}>
        Mot de passe oublié ?
      </Link>
    </AuthShell>
  );
}
