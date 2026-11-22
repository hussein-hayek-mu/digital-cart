import { API_ROUTES, CURRENCY_CODE, HTTP_STATUS } from "@repo/shared";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "./config/env.js";
import { createMemoryStore } from "./db/memory-store.js";
import { createPool } from "./db/pool.js";
import { createPostgresStore } from "./db/postgres-store.js";
import { configureAuth } from "./lib/auth/middleware.js";
import { logger } from "./lib/logger.js";
import { loadRootEnv } from "./load-root-env.js";
import { createPaymentProvider } from "./payments/index.js";
import { mountAdminRoutes } from "./routes/admin.js";
import { mountCatalogRoutes } from "./routes/catalog.js";
import { mountCheckoutRoutes } from "./routes/checkout.js";
import { mountOrderRoutes } from "./routes/orders.js";
import { mountProfileRoutes } from "./routes/profile.js";
import { mountWaveWebhookRoutes } from "./routes/webhooks/wave.js";
import { startOutboxWorker } from "./workers/outbox-processor.js";
import { startReconciliationWorker } from "./workers/reconciliation.js";

/**
 * Phase 5 API entrypoint.
 *
 * Public catalog, authenticated profile, checkout, Wave webhook (raw body),
 * outbox worker, and payment reconciliation are mounted here.
 * PAYMENT_PROVIDER defaults to "fake" — no live Wave calls unless configured.
 */

loadRootEnv();
const env = loadEnv();
configureAuth(env);

const pool = env.USE_MEMORY_STORE || !env.DATABASE_URL ? null : createPool(env.DATABASE_URL);

const store = pool
  ? createPostgresStore(pool)
  : createMemoryStore({
      encryptionKey: env.CODE_ENCRYPTION_KEY_v1,
      fingerprintPepper: env.CODE_FINGERPRINT_PEPPER,
    });

if (!pool) {
  logger.warn("using_memory_store_data_resets_on_restart");
}

const provider = createPaymentProvider(env);
const appCtx = { env, store, provider };

const app = express();

app.disable("x-powered-by");
app.use(helmet());

const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));

// Wave webhook must be registered before express.json() for raw-body signature verification.
mountWaveWebhookRoutes(app, appCtx);

app.use(express.json());

app.get(API_ROUTES.HEALTH, (_req, res) => {
  res.status(HTTP_STATUS.OK).json({
    status: "ok",
    service: "api",
    currency: CURRENCY_CODE,
    timestamp: new Date().toISOString(),
  });
});

app.get(API_ROUTES.READY, async (_req, res) => {
  let databaseOk = true;
  if (pool) {
    try {
      await pool.query("SELECT 1");
    } catch {
      databaseOk = false;
    }
  }
  res.status(databaseOk ? HTTP_STATUS.OK : 503).json({
    status: databaseOk ? "ready" : "database_unavailable",
    store: pool ? "database" : "memory",
    paymentProvider: provider.name,
    timestamp: new Date().toISOString(),
  });
});

mountCatalogRoutes(app, store);
mountProfileRoutes(app, store);
mountCheckoutRoutes(app, appCtx);
mountOrderRoutes(app, appCtx);
mountAdminRoutes(app, pool ? { pool, store, env } : null);

app.use((_req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code: "NOT_FOUND" } });
});

// Error handler must have 4 params to be recognized by Express.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      error: { code: "VALIDATION_ERROR", details: err.flatten() },
    });
    return;
  }
  const code = (err as { code?: string } | null)?.code;
  if (code === "UNAUTHORIZED") {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: { code } });
    return;
  }
  if (code === "PRODUCT_NOT_FOUND") {
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: { code } });
    return;
  }
  if (code === "INSUFFICIENT_STOCK") {
    res.status(HTTP_STATUS.CONFLICT).json({ error: { code } });
    return;
  }
  logger.error("unhandled_error", {
    error: err instanceof Error ? err.message : "unknown",
  });
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: { code: "INTERNAL_ERROR" } });
});

const stopOutbox = startOutboxWorker({ store, provider, env, intervalMs: 2_000 });
const stopReconciliation = startReconciliationWorker({ store, provider, env, intervalMs: 60_000 });

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  console.log(
    `API listening on http://${env.API_HOST}:${env.API_PORT} (store: ${pool ? "database" : "memory"}, payment provider: ${provider.name})`,
  );
});

function shutdown() {
  stopOutbox();
  stopReconciliation();
  server.close(() => {
    void (pool?.end() ?? Promise.resolve()).finally(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
