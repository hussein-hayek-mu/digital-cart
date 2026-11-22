"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthNotice } from "@/components/auth-notice";
import { AuthShell } from "@/components/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function describeSignUpError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("rate limit")) {
    return "Trop de tentatives d’envoi d’e-mail. Patientez quelques minutes puis réessayez.";
  }
  if (m.includes("password")) {
    return "Mot de passe refusé : utilisez au moins 8 caractères.";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "Adresse e-mail invalide.";
  }
  if (m.includes("sending") || m.includes("smtp")) {
    return "L’e-mail de confirmation n’a pas pu être envoyé. Réessayez plus tard ou contactez le support.";
  }
  return message || "Impossible de créer le compte.";
}

export default function InscriptionPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const trimmedEmail = email.trim();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
        emailRedirectTo: `${window.location.origin}/connexion?confirme=1`,
      },
    });

    setLoading(false);
    if (signUpError) {
      setError(describeSignUpError(signUpError.message));
      return;
    }

    // Email confirmation disabled in Supabase: the user is signed in immediately.
    if (data.session) {
      router.push("/compte");
      router.refresh();
      return;
    }

    // Supabase returns a user with no identities when the address is already registered.
    if (data.user && data.user.identities?.length === 0) {
      setError("Un compte existe déjà avec cette adresse. Connectez-vous ou réinitialisez votre mot de passe.");
      return;
    }

    router.push(`/verification?email=${encodeURIComponent(trimmedEmail)}`);
  }

  return (
    <AuthShell
      eyebrow="Espace client"
      title="Créer un compte"
      subtitle="Inscrivez-vous pour suivre vos commandes et gérer votre profil."
      footer={
        <p className="text-muted" style={{ fontSize: "0.9rem" }}>
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="text-accent">
            Se connecter
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label htmlFor="fullName" className="field-label">
            Nom complet <span className="text-faint">(optionnel)</span>
          </label>
          <input
            id="fullName"
            type="text"
            className="input"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>{error}</p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Création…" : "Créer mon compte"}
        </button>
      </form>
    </AuthShell>
  );
}
