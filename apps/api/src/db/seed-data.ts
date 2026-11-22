export type SeedCategory = {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
};

export type SeedProduct = {
  categorySlug: string;
  name: string;
  slug: string;
  platform: string;
  region: string;
  faceValue: string;
  faceCurrency: string;
  priceMinor: number;
  /** Fake codes for testing; never sell these. */
  demoCodes: string[];
};

export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: "playstation", name: "PlayStation", description: "Cartes PlayStation Network", sortOrder: 1 },
  { slug: "steam", name: "Steam", description: "Porte-monnaie Steam", sortOrder: 2 },
  { slug: "roblox", name: "Roblox", description: "Cartes Roblox", sortOrder: 3 },
  { slug: "nintendo", name: "Nintendo", description: "Nintendo eShop", sortOrder: 4 },
  { slug: "xbox", name: "Xbox", description: "Cartes Xbox / Microsoft", sortOrder: 5 },
];

const demoCodes = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(4, "0")}`);

const p = (
  categorySlug: string,
  name: string,
  slug: string,
  platform: string,
  region: string,
  faceValue: string,
  faceCurrency: string,
  priceMinor: number,
  codes: string[],
): SeedProduct => ({ categorySlug, name, slug, platform, region, faceValue, faceCurrency, priceMinor, demoCodes: codes });

export const SEED_PRODUCTS: SeedProduct[] = [
  p("playstation", "PlayStation Store 10 USD — US", "psn-10-us", "PlayStation", "US", "10", "USD", 7500, demoCodes("PSN10US", 5)),
  p("playstation", "PlayStation Store 20 USD — US", "psn-20-us", "PlayStation", "US", "20", "USD", 14500, demoCodes("PSN20US", 5)),
  p("playstation", "PlayStation Store 50 USD — US", "psn-50-us", "PlayStation", "US", "50", "USD", 35500, demoCodes("PSN50US", 3)),
  p("playstation", "PlayStation Store 20 EUR — Europe", "psn-20-eu", "PlayStation", "Europe", "20", "EUR", 15500, demoCodes("PSN20EU", 4)),

  p("steam", "Steam Wallet 5 USD — Global", "steam-5-global", "Steam", "Global", "5", "USD", 4500, demoCodes("STM05GL", 6)),
  p("steam", "Steam Wallet 10 USD — Global", "steam-10-global", "Steam", "Global", "10", "USD", 8500, demoCodes("STM10GL", 5)),
  p("steam", "Steam Wallet 20 USD — Global", "steam-20-global", "Steam", "Global", "20", "USD", 16500, demoCodes("STM20GL", 4)),
  p("steam", "Steam Wallet 50 USD — Global", "steam-50-global", "Steam", "Global", "50", "USD", 39500, demoCodes("STM50GL", 2)),

  p("roblox", "Roblox 800 Robux", "roblox-800", "Roblox", "Global", "800", "Robux", 6500, demoCodes("RBX0800", 5)),
  p("roblox", "Roblox 2000 Robux", "roblox-2000", "Roblox", "Global", "2000", "Robux", 14500, demoCodes("RBX2000", 4)),
  p("roblox", "Roblox Gift Card 25 USD", "roblox-25-usd", "Roblox", "US", "25", "USD", 18500, demoCodes("RBX25US", 3)),

  p("nintendo", "Nintendo eShop 10 USD — US", "nintendo-10-us", "Nintendo", "US", "10", "USD", 7800, demoCodes("NIN10US", 4)),
  p("nintendo", "Nintendo eShop 20 USD — US", "nintendo-20-us", "Nintendo", "US", "20", "USD", 14800, demoCodes("NIN20US", 4)),
  p("nintendo", "Nintendo eShop 15 EUR — Europe", "nintendo-15-eu", "Nintendo", "Europe", "15", "EUR", 12000, demoCodes("NIN15EU", 3)),

  p("xbox", "Xbox Gift Card 10 USD — US", "xbox-10-us", "Xbox", "US", "10", "USD", 7600, demoCodes("XBX10US", 4)),
  p("xbox", "Xbox Gift Card 25 USD — US", "xbox-25-us", "Xbox", "US", "25", "USD", 18200, demoCodes("XBX25US", 3)),
  p("xbox", "Xbox Gift Card 15 EUR — Europe", "xbox-15-eu", "Xbox", "Europe", "15", "EUR", 11800, demoCodes("XBX15EU", 3)),

  // Exactly one code, for out-of-stock and race testing
  p("steam", "Steam Wallet 1 USD — Test stock faible", "steam-1-lowstock", "Steam", "Global", "1", "USD", 1000, ["STM01LOW0001"]),
];

export const productDescription = (name: string) =>
  `${name} — livraison numérique instantanée après paiement confirmé.`;

export const PRODUCT_INSTRUCTIONS =
  "Après achat, ouvrez le code sur la page sécurisée de la commande, puis suivez les instructions d’activation de la plateforme.";
