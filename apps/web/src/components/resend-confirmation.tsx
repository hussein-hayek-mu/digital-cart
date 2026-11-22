"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResendConfirmation({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/connexion?confirme=1` },
    });

    if (resendError) {
      setStatus("error");
      setError(
        resendError.message.toLowerCase().includes("rate limit") ||
          resendError.message.toLowerCase().includes("seconds")
          ? "Trop de demandes. Patientez une minute avant de renvoyer l’e-mail."
          : "L’e-mail n’a pas pu être renvoyé. Réessayez plus tard.",
      );
      return;
    }
    setStatus("sent");
  }

  return (
    <form onSubmit={handleResend} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label htmlFor="resend-email" className="field-label">
          Adresse e-mail
        </label>
        <input
          id="resend-email"
          type="email"
          className="input"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <button type="submit" className="btn btn-secondary btn-block" disabled={status === "sending"}>
        {status === "sending" ? "Envoi…" : "Renvoyer l’e-mail de confirmation"}
      </button>
      <p role="status" aria-live="polite" style={{ fontSize: "0.9rem" }}>
        {status === "sent" ? (
          <span style={{ color: "var(--success)" }}>
            E-mail renvoyé. Vérifiez votre boîte de réception et le dossier spam.
          </span>
        ) : null}
        {status === "error" && error ? <span style={{ color: "var(--error)" }}>{error}</span> : null}
      </p>
    </form>
  );
}
