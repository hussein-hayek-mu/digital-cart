import { regionLabel, shortDenomination } from "@/lib/format";
import { platformColor } from "@/lib/platforms";
import { hasPlatformIcon, PlatformLogo } from "./platform-logo";

type GiftCardArtProps = {
  platform: string;
  faceValue: string;
  faceCurrency: string;
  region: string;
  imageUrl?: string | null;
  alt?: string;
  /** `thumb` shows only the centred logo, for small cart/summary thumbnails. */
  variant?: "full" | "thumb";
};

/**
 * Real gift-card ratio (1.586:1). Uses supplied official artwork when present;
 * otherwise an original flat placeholder with the platform mark.
 */
export function GiftCardArt({
  platform,
  faceValue,
  faceCurrency,
  region,
  imageUrl,
  alt,
  variant = "full",
}: GiftCardArtProps) {
  const { value, unit } = shortDenomination(faceValue, faceCurrency);

  return (
    <div className={`gc-art${variant === "thumb" ? " gc-art--thumb" : ""}`}>
      <div className="gc-art__inner">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={alt ?? ""} loading="lazy" />
        ) : variant === "thumb" ? (
          <>
            <span className="gc-art__stripe" style={{ background: platformColor(platform) }} aria-hidden="true" />
            <span className="gc-art__thumb-logo">
              <PlatformLogo platform={platform} size={22} />
            </span>
          </>
        ) : (
          <>
            <span className="gc-art__facet" aria-hidden="true" />
            <span className="gc-art__stripe" style={{ background: platformColor(platform) }} aria-hidden="true" />
            <span className="gc-art__platform">
              {hasPlatformIcon(platform) ? <PlatformLogo platform={platform} size={20} /> : null}
              <span className="gc-art__platform-name">{platform}</span>
            </span>
            <span className="gc-art__region">{regionLabel(region)}</span>
            <span className="gc-art__value">
              {value}
              <small>{unit}</small>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
