function usable(value: string | undefined): boolean {
  return Boolean(value && !value.includes("PLACEHOLDER") && value.trim().length > 0);
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export type SupabaseConfigStatus = {
  configured: boolean;
  urlOk: boolean;
  anonKeyOk: boolean;
  urlHint: "missing" | "placeholder" | "ok";
  anonKeyHint: "missing" | "placeholder" | "ok";
};

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  const urlHint = !url.trim()
    ? "missing"
    : url.includes("PLACEHOLDER")
      ? "placeholder"
      : "ok";
  const anonKeyHint = !key.trim()
    ? "missing"
    : key.includes("PLACEHOLDER")
      ? "placeholder"
      : "ok";
  const urlOk = usable(url);
  const anonKeyOk = usable(key);
  return {
    configured: urlOk && anonKeyOk,
    urlOk,
    anonKeyOk,
    urlHint,
    anonKeyHint,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}
