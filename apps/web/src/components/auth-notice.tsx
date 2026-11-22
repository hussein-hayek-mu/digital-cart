"use client";

import Link from "next/link";
import { getSupabaseConfigStatus } from "@/lib/supabase/config";

function hintLabel(hint: "missing" | "placeholder" | "ok"): string {
  if (hint === "ok") return "OK";
  if (hint === "placeholder") return "encore PLACEHOLDER";
  return "manquant";
}

export function AuthNotice() {
  const status = getSupabaseConfigStatus();

  return (
    <div
      className="surface-card"
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderColor: "rgba(242, 165, 61, 0.35)",
      }}
    >
      <h2 style={{ fontSize: "1.2rem" }}>Supabase non configuré</h2>
      <p className="text-muted" style={{ fontSize: "0.95rem" }}>
        L&apos;authentification lit le fichier <code>.env</code> à la racine du monorepo.
        Remplacez les valeurs <code>PLACEHOLDER</code> par celles de{" "}
        <strong>Supabase → Project Settings → API</strong>, puis redémarrez{" "}
        <code>pnpm dev</code>.
      </p>
      <ul className="text-muted" style={{ fontSize: "0.9rem", margin: 0, paddingLeft: 18 }}>
        <li>
          <code>NEXT_PUBLIC_SUPABASE_URL</code> — {hintLabel(status.urlHint)}
        </li>
        <li>
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> — {hintLabel(status.anonKeyHint)}
        </li>
      </ul>
      <p className="text-muted" style={{ fontSize: "0.85rem" }}>
        Exemple :
        <br />
        <code style={{ color: "var(--color-accent)" }}>
          NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
        </code>
        <br />
        <code style={{ color: "var(--color-accent)" }}>
          NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
        </code>
      </p>
      <Link href="/" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}>
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
