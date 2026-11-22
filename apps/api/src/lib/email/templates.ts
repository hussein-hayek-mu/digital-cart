import type { EmailMessage } from "./index.js";

const BRAND = "Carte PSN Abidjan";

function formatXofDisplay(amountMinor: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amountMinor)} FCFA`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Line = { name: string; quantity: number };

function layout(params: { heading: string; paragraphs: string[]; cta?: { label: string; href: string }; footnote?: string }) {
  const body = params.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2633">${p}</p>`)
    .join("");
  const cta = params.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(params.cta.href)}" style="display:inline-block;background:#006fcd;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:999px">${escapeHtml(params.cta.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#5b6577">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#1f2633">${escapeHtml(params.cta.href)}</span></p>`
    : "";
  const footnote = params.footnote
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5b6577">${params.footnote}</p>`
    : "";
  return `<!doctype html>
<html lang="fr"><body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b1220;padding:20px 28px;color:#ffffff;font-weight:800;font-size:18px">${BRAND}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#090b10">${escapeHtml(params.heading)}</h1>
${body}${cta}${footnote}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #e3e8f0;font-size:12px;line-height:1.5;color:#5b6577">
${BRAND} est un revendeur indépendant. Nous ne vous demanderons jamais votre code secret Wave.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function linesHtml(lines: Line[]): string {
  return lines.map((l) => `${l.quantity} × ${escapeHtml(l.name)}`).join("<br>");
}

function linesText(lines: Line[]): string {
  return lines.map((l) => `- ${l.quantity} x ${l.name}`).join("\n");
}

export function orderReadyEmail(params: {
  to: string;
  customerName: string;
  publicReference: string;
  totalAmountMinor: number;
  lines: Line[];
  link: string;
  linkValidDays: number;
}): EmailMessage {
  const greeting = params.customerName ? `Bonjour ${params.customerName},` : "Bonjour,";
  const total = formatXofDisplay(params.totalAmountMinor);
  return {
    to: params.to,
    subject: `Vos codes sont prêts — commande ${params.publicReference}`,
    html: layout({
      heading: "Vos codes sont prêts",
      paragraphs: [
        escapeHtml(greeting),
        `Votre paiement est confirmé. Commande <strong>${escapeHtml(params.publicReference)}</strong> · ${escapeHtml(total)}`,
        linesHtml(params.lines),
        "Pour votre sécurité, les codes ne sont jamais envoyés par e-mail. Ouvrez votre commande pour les afficher :",
      ],
      cta: { label: "Afficher mes codes", href: params.link },
      footnote: `Ce lien est personnel et valable ${params.linkValidDays} jours. Ne le transférez à personne. Passé ce délai, demandez un nouveau lien depuis la page « Suivre ma commande ».`,
    }),
    text: [
      greeting,
      "",
      `Votre paiement est confirmé. Commande ${params.publicReference} · ${total}`,
      linesText(params.lines),
      "",
      "Pour votre sécurité, les codes ne sont jamais envoyés par e-mail. Ouvrez votre commande pour les afficher :",
      params.link,
      "",
      `Ce lien est personnel et valable ${params.linkValidDays} jours. Ne le transférez à personne.`,
    ].join("\n"),
  };
}

export function orderLinkEmail(params: {
  to: string;
  publicReference: string;
  link: string;
  linkValidHours: number;
}): EmailMessage {
  return {
    to: params.to,
    subject: `Votre lien d’accès — commande ${params.publicReference}`,
    html: layout({
      heading: "Accédez à votre commande",
      paragraphs: [
        `Vous avez demandé à consulter la commande <strong>${escapeHtml(params.publicReference)}</strong>.`,
      ],
      cta: { label: "Ouvrir ma commande", href: params.link },
      footnote: `Ce lien est personnel et valable ${params.linkValidHours} heures. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : personne ne peut accéder à votre commande sans ce lien.`,
    }),
    text: [
      `Vous avez demandé à consulter la commande ${params.publicReference}.`,
      "",
      "Ouvrir ma commande :",
      params.link,
      "",
      `Ce lien est personnel et valable ${params.linkValidHours} heures. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.`,
    ].join("\n"),
  };
}

export function orderReviewEmail(params: {
  to: string;
  customerName: string;
  publicReference: string;
  link: string;
}): EmailMessage {
  const greeting = params.customerName ? `Bonjour ${params.customerName},` : "Bonjour,";
  return {
    to: params.to,
    subject: `Commande ${params.publicReference} en cours de vérification`,
    html: layout({
      heading: "Votre commande est en vérification",
      paragraphs: [
        escapeHtml(greeting),
        `Nous avons bien reçu votre paiement pour la commande <strong>${escapeHtml(params.publicReference)}</strong>, mais elle nécessite une vérification manuelle avant la livraison des codes.`,
        "Notre équipe s’en occupe. Vous recevrez un nouvel e-mail dès que vos codes seront disponibles, ou un remboursement si la commande ne peut pas être livrée.",
      ],
      cta: { label: "Suivre ma commande", href: params.link },
    }),
    text: [
      greeting,
      "",
      `Nous avons bien reçu votre paiement pour la commande ${params.publicReference}, mais elle nécessite une vérification manuelle avant la livraison des codes.`,
      "Vous recevrez un nouvel e-mail dès que vos codes seront disponibles, ou un remboursement si la commande ne peut pas être livrée.",
      "",
      params.link,
    ].join("\n"),
  };
}
