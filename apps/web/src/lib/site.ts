export const SITE = {
  name: "Carte PSN Abidjan",
  wordmarkMain: "Carte PSN",
  wordmarkCity: "Abidjan",
  /** Flip to true once live Wave payments are enabled (Phase 10). */
  waveLive: process.env.NEXT_PUBLIC_PAYMENT_PROVIDER === "wave",
  support: {
    hours: "Lun–Sam, 9h–20h",
    whatsappDisplay: "+225 00 00 00 00 00",
    whatsappHref: "https://wa.me/2250000000000",
    email: "support@exemple.ci",
  },
} as const;
