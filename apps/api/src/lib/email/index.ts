import type { Env } from "../../config/env.js";
import { logger } from "../logger.js";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type Mailer = {
  name: "log" | "resend";
  send(message: EmailMessage): Promise<void>;
};

function createResendMailer(apiKey: string, from: string, replyTo?: string): Mailer {
  return {
    name: "resend",
    async send(message) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        // The response body can echo the recipient; keep only the status.
        throw new Error(`EMAIL_SEND_FAILED: HTTP ${res.status}`);
      }
    },
  };
}

/**
 * Development mailer: prints the email to the console instead of sending it.
 * Emails contain order access links, so this is refused in production.
 */
function createLogMailer(env: Env): Mailer {
  return {
    name: "log",
    async send(message) {
      if (env.NODE_ENV === "production") {
        throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
      }
      console.log(
        `\n----- EMAIL (not sent: EMAIL_PROVIDER=log) -----\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n------------------------------------------------\n`,
      );
    },
  };
}

let cached: { env: Env; mailer: Mailer } | undefined;

export function getMailer(env: Env): Mailer {
  if (cached?.env === env) return cached.mailer;
  let mailer: Mailer;
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    mailer = createResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM, env.EMAIL_REPLY_TO);
  } else {
    mailer = createLogMailer(env);
  }
  logger.info("mailer_configured", { provider: mailer.name });
  cached = { env, mailer };
  return mailer;
}
