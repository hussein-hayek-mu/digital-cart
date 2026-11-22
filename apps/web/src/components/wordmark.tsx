import { SITE } from "@/lib/site";

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark__main">{SITE.wordmarkMain}</span>
      <span className="wordmark__city">{SITE.wordmarkCity}</span>
    </span>
  );
}
