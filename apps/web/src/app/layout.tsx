import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { CartProvider } from "@/components/cart-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Carte PSN Abidjan — Cartes cadeaux gaming en FCFA",
  description:
    "Cartes cadeaux numériques PlayStation, Steam, Xbox, Nintendo et Roblox à Abidjan. Prix en FCFA, code disponible en ligne dès le paiement confirmé.",
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body>
        <AuthProvider>
          <CartProvider>
            <SiteHeader />
            <div id="contenu">{children}</div>
            <SiteFooter />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
