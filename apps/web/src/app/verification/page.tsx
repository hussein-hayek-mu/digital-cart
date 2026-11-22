import Link from "next/link";
import { AuthNotice } from "@/components/auth-notice";
import { AuthShell } from "@/components/auth-shell";
import { ResendConfirmation } from "@/components/resend-confirmation";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email = "" } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <main className="page-section">
        <div className="container" style={{ maxWidth: 520 }}>
          <AuthNotice />
        </div>
      </main>
    );
  }

  return (
    <AuthShell
      eyebrow="Espace client"
      title="Vérifiez votre e-mail"
      subtitle={
        email
          ? `Nous avons envoyé un lien de confirmation à ${email}. Ouvrez-le pour activer votre compte.`
          : "Nous avons envoyé un lien de confirmation à votre adresse. Ouvrez-le pour activer votre compte."
      }
      footer={
        <p className="text-muted" style={{ fontSize: "0.9rem" }}>
          Déjà confirmé ?{" "}
          <Link href="/connexion" className="text-accent">
            Se connecter
          </Link>
        </p>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <p className="text-muted" style={{ fontSize: "0.95rem" }}>
          L’e-mail peut prendre quelques minutes. Pensez à vérifier le dossier spam ou
          « Promotions ». Rien reçu ? Renvoyez-le ci-dessous.
        </p>
        <ResendConfirmation initialEmail={email} />
      </div>
    </AuthShell>
  );
}
