export type PlatformInfo = {
  slug: string;
  name: string;
  /** Official-ish platform colour — only used inside artwork and small markers. */
  color: string;
  /** Shown in navigation only once the catalogue has a matching category. */
  listed: boolean;
};

export const PLATFORMS: PlatformInfo[] = [
  { slug: "playstation", name: "PlayStation", color: "#0070D1", listed: true },
  { slug: "steam", name: "Steam", color: "#66C0F4", listed: true },
  { slug: "xbox", name: "Xbox", color: "#107C10", listed: true },
  { slug: "nintendo", name: "Nintendo", color: "#E60012", listed: true },
  { slug: "roblox", name: "Roblox", color: "#E2231A", listed: true },
  { slug: "apple", name: "Apple", color: "#A2AAAD", listed: false },
  { slug: "google-play", name: "Google Play", color: "#01875F", listed: false },
];

export const NAV_PLATFORMS = PLATFORMS.filter((p) => p.listed);

const FALLBACK_COLOR = "#5B6577";

export function platformColor(nameOrSlug: string): string {
  const key = nameOrSlug.toLowerCase().replace(/\s+/g, "-");
  return PLATFORMS.find((p) => p.slug === key || p.name.toLowerCase() === nameOrSlug.toLowerCase())
    ?.color ?? FALLBACK_COLOR;
}
