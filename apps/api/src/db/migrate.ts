import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../load-root-env.js";
import { createPool } from "./pool.js";

/**
 * Applies `supabase/migrations/*.sql` in filename order, once each.
 * Applied files are tracked in `app_private.schema_migrations`, a schema
 * that is not exposed through the Supabase Data API.
 *
 * Usage: tsx src/db/migrate.ts [--status]
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../../../supabase/migrations");

async function main() {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.includes("PLACEHOLDER")) {
    throw new Error("DATABASE_URL is not configured in the root .env");
  }
  const statusOnly = process.argv.includes("--status");
  const pool = createPool(databaseUrl, { max: 1 });

  try {
    const { rows: info } = await pool.query<{ version: string; db: string; usr: string }>(
      "SELECT version() AS version, current_database() AS db, current_user AS usr",
    );
    console.log(`Connected: ${info[0].db} as ${info[0].usr}`);

    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS app_private;
      REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS app_private.schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const { rows: appliedRows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM app_private.schema_migrations",
    );
    const applied = new Set(appliedRows.map((r) => r.filename));
    const pending = files.filter((f) => !applied.has(f));

    if (applied.size === 0 && pending.length > 0) {
      const { rows } = await pool.query<{ exists: boolean }>(
        "SELECT to_regclass('public.products') IS NOT NULL AS exists",
      );
      if (rows[0].exists) {
        throw new Error(
          "public.products already exists but no migrations are recorded. " +
            "The schema was created outside this tool; refusing to re-apply.",
        );
      }
    }

    for (const f of files) console.log(`${applied.has(f) ? "[applied]" : "[pending]"} ${f}`);
    if (statusOnly || pending.length === 0) {
      if (pending.length === 0) console.log("Database is up to date.");
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      process.stdout.write(`Applying ${file} ... `);
      const client = await pool.connect();
      try {
        await client.query(sql);
        await client.query("INSERT INTO app_private.schema_migrations (filename) VALUES ($1)", [file]);
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.log("FAILED");
        throw err;
      } finally {
        client.release();
      }
    }
    console.log("All migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
