import { loadEnv } from "../config/env.js";
import { loadRootEnv } from "../load-root-env.js";
import { createPool, withTransaction } from "./pool.js";

/**
 * Grants (or with --remove, revokes) the admin role for an existing account.
 * The person must have signed up on the site first.
 *
 * Usage: tsx src/db/make-admin.ts someone@example.com [--remove]
 */
async function main() {
  loadRootEnv();
  const env = loadEnv();
  const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();
  const remove = process.argv.includes("--remove");
  if (!email) throw new Error("Usage: make-admin <email> [--remove]");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not configured in the root .env");

  const pool = createPool(env.DATABASE_URL, { max: 1 });
  try {
    const message = await withTransaction(pool, async (db) => {
      const { rows } = await db.query(`SELECT id FROM auth.users WHERE lower(email) = $1`, [email]);
      if (!rows[0]) return `No account found for ${email}. Sign up on the site first, then run this again.`;
      const userId = rows[0].id as string;
      await db.query(
        `INSERT INTO public.profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [userId, email],
      );
      if (remove) {
        const { rowCount } = await db.query(
          `DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'admin'`,
          [userId],
        );
        return rowCount ? `Admin access removed for ${email}.` : `${email} was not an admin.`;
      }
      const { rowCount } = await db.query(
        `INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`,
        [userId],
      );
      return rowCount ? `${email} is now an admin.` : `${email} was already an admin.`;
    });
    console.log(message);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
