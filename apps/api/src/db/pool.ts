import pg from "pg";
import { logger } from "../lib/logger.js";

// BIGINT (int8) columns hold money in XOF minor units, far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

const CONNECTION_ERROR_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT", "57P01", "08006", "08003"]);

/** The connection died (pooler restart, idle socket dropped by the network) rather than the query failing. */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code && CONNECTION_ERROR_CODES.has(e.code)) return true;
  const message = e.message ?? "";
  return (
    message.includes("Connection terminated") ||
    message.includes("ECONNRESET") ||
    message.includes("Client has encountered a connection error")
  );
}

export function createPool(databaseUrl: string, opts: { max?: number } = {}): pg.Pool {
  const url = new URL(databaseUrl);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  // pg treats sslmode in the URL as verify-full; TLS is configured below instead.
  url.searchParams.delete("sslmode");

  const pool = new pg.Pool({
    connectionString: url.toString(),
    max: opts.max ?? 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  pool.on("error", () => {
    // Idle client errors (e.g. pooler restarts) must not crash the process.
  });

  // Retry a single statement once on a fresh connection when the socket died.
  // Inserts use client-generated ids (a repeat fails on the key) and updates
  // set absolute values; only reveal counters could over-count by one.
  const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => Promise<unknown>;
  (pool as unknown as { query: (...args: unknown[]) => Promise<unknown> }).query = async (...args: unknown[]) => {
    if (typeof args[args.length - 1] === "function") return originalQuery(...args);
    try {
      return await originalQuery(...args);
    } catch (err) {
      if (!isConnectionError(err)) throw err;
      logger.warn("db_connection_retry");
      return originalQuery(...args);
    }
  };

  return pool;
}

async function connectAndBegin(pool: pg.Pool): Promise<pg.PoolClient> {
  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      return client;
    } catch (err) {
      client.release(err instanceof Error ? err : true);
      if (attempt >= 2 || !isConnectionError(err)) throw err;
      logger.warn("db_connection_retry");
    }
  }
}

export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await connectAndBegin(pool);
  let broken = false;
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    broken = isConnectionError(err);
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release(broken);
  }
}
