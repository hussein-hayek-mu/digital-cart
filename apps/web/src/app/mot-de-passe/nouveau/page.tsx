"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function NouveauMotDePassePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => subscription.unsubscribe();
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

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError("Impossible de mettre à jour le mot de passe. Réessayez via le lien reçu par e-mail.");
      return;
    }

    router.push("/connexion");
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Espace client"
      title="Nouveau mot de passe"
      subtitle="Choisissez un mot de passe sécurisé pour votre compte."
      footer={
        <Link href="/connexion" className="text-muted" style={{ fontSize: "0.9rem" }}>
          ← Retour à la connexion
        </Link>
      }
    >
      {!ready ? (
        <p className="text-muted" style={{ fontSize: "0.95rem" }}>
          Ouvrez le lien reçu par e-mail pour accéder à cette page. Si vous venez de cliquer le lien, patientez un instant…
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label htmlFor="password" className="field-label">
              Nouveau mot de passe
            </label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="confirm" className="field-label">
              Confirmer le mot de passe
            </label>
            <input
              id="confirm"
              type="password"
              className="input"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
