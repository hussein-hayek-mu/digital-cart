import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(__dirname, "../..");

/**
 * Next.js only auto-loads `.env*` from `apps/web`.
 * This monorepo keeps the real `.env` at the repo root, so load it here.
 */
function loadRootEnvFile(): void {
  const envPath = path.join(monorepoRoot, ".env");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function isUsable(value: string | undefined): boolean {
  return Boolean(value && !value.includes("PLACEHOLDER") && value.trim().length > 0);
}

loadRootEnvFile();

if (!isUsable(process.env.NEXT_PUBLIC_SUPABASE_URL) && isUsable(process.env.SUPABASE_URL)) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/shared"],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
  },
};

export default nextConfig;
