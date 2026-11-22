import { siApple, siGoogleplay, siPlaystation, siRoblox, siSteam } from "simple-icons";

const ICONS: Record<string, { path: string; title: string }> = {
  playstation: siPlaystation,
  steam: siSteam,
  roblox: siRoblox,
  apple: siApple,
  "google-play": siGoogleplay,
};

function toKey(platform: string): string {
  return platform.trim().toLowerCase().replace(/\s+/g, "-");
}

export function hasPlatformIcon(platform: string): boolean {
  return toKey(platform) in ICONS;
}

/**
 * Platform mark used only to identify the product being sold.
 * Brands without an available vector mark fall back to a text wordmark.
 */
export function PlatformLogo({
  platform,
  size = 24,
  className = "",
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  const icon = ICONS[toKey(platform)];

  if (!icon) {
    return (
      <span
        className={`platform-wordmark ${className}`}
        style={{ fontSize: Math.round(size * 0.62) }}
        role="img"
        aria-label={platform}
      >
        {platform}
      </span>
    );
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label={platform}
    >
      <path d={icon.path} />
    </svg>
  );
}
