import { encryptCardSecret, fingerprintCode, maskCode, normalizeCode } from "@repo/shared";
import { loadEnv } from "../config/env.js";
import { loadRootEnv } from "../load-root-env.js";
import { generatePublicId } from "../lib/ids.js";
import { createPool, withTransaction } from "./pool.js";
import { PRODUCT_INSTRUCTIONS, SEED_CATEGORIES, SEED_PRODUCTS, productDescription } from "./seed-data.js";

/**
 * Inserts the starter catalog and demo codes. Existing rows (matched by slug
 * or code fingerprint) are left untouched, so this is safe to re-run.
 *
 * Usage: tsx src/db/seed.ts [--no-codes]
 */
async function main() {
  loadRootEnv();
  const env = loadEnv();
  if (!env.DATABASE_URL || env.DATABASE_URL.includes("PLACEHOLDER")) {
    throw new Error("DATABASE_URL is not configured in the root .env");
  }
  const withCodes = !process.argv.includes("--no-codes");
  const pool = createPool(env.DATABASE_URL, { max: 1 });

  try {
    const summary = await withTransaction(pool, async (db) => {
      let categories = 0;
      let products = 0;
      let codes = 0;

      for (const cat of SEED_CATEGORIES) {
        const { rowCount } = await db.query(
          `INSERT INTO public.categories (public_id, name, slug, description, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slug) DO NOTHING`,
          [generatePublicId("cat"), cat.name, cat.slug, cat.description, cat.sortOrder],
        );
        categories += rowCount ?? 0;
      }

      for (const seed of SEED_PRODUCTS) {
        const { rowCount } = await db.query(
          `INSERT INTO public.products (
             public_id, category_id, name, slug, platform, region, face_value, face_currency,
             sale_amount_minor, description, instructions
           )
           SELECT $1, c.id, $2, $3, $4, $5, $6, $7, $8, $9, $10
           FROM public.categories c WHERE c.slug = $11
           ON CONFLICT (slug) DO NOTHING`,
          [
            generatePublicId("prd"),
            seed.name,
            seed.slug,
            seed.platform,
            seed.region,
            seed.faceValue,
            seed.faceCurrency,
            seed.priceMinor,
            productDescription(seed.name),
            PRODUCT_INSTRUCTIONS,
            seed.categorySlug,
          ],
        );
        products += rowCount ?? 0;

        if (!withCodes) continue;
        const { rows } = await db.query(`SELECT id FROM public.products WHERE slug = $1`, [seed.slug]);
        const productId = rows[0].id as string;
        for (const raw of seed.demoCodes) {
          const code = normalizeCode(raw);
          const enc = encryptCardSecret({ code }, env.CODE_ENCRYPTION_KEY_v1, 1);
          const result = await db.query(
            `INSERT INTO public.card_inventory (
               product_id, encrypted_payload, encryption_iv, authentication_tag,
               encryption_key_version, code_fingerprint, masked_code
             ) VALUES ($1, $2, $3, $4, 1, $5, $6)
             ON CONFLICT (code_fingerprint) DO NOTHING`,
            [productId, enc.ciphertext, enc.iv, enc.authTag, fingerprintCode(code, env.CODE_FINGERPRINT_PEPPER), maskCode(code)],
          );
          codes += result.rowCount ?? 0;
        }
      }
      return { categories, products, codes };
    });

    console.log(
      `Seed complete: ${summary.categories} categories, ${summary.products} products, ${summary.codes} demo codes added.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
