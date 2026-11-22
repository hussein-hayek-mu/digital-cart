# Wave Phase 5 — Outbox, Reconciliation & Webhooks

Phase 5 wires the payment completion pipeline end-to-end: Wave webhooks enqueue fulfilment jobs, an outbox worker processes them reliably, and a reconciliation worker catches missed webhooks.

## Local development (default: fake provider)

No Wave credentials are required. The API starts with `PAYMENT_PROVIDER=fake` (default).

1. Start the API: `pnpm --filter @repo/api dev`
2. Create a checkout session via `POST /api/v1/checkout/sessions`
3. Complete payment in dev: `POST /api/v1/dev/complete-payment` with `{ "sessionId": "..." }`

This exercises the same path as production: `processWaveCompletedEvent` → outbox → `runFulfilCheckoutJob`.

## Enabling live Wave

Set these environment variables (see `.env.example`):

| Variable | Required | Purpose |
|----------|----------|---------|
| `PAYMENT_PROVIDER` | yes | Set to `wave` |
| `WAVE_API_KEY` | yes | Checkout API bearer token |
| `WAVE_SIGNING_SECRET` | recommended | Request signing for POST bodies |
| `WAVE_WEBHOOK_SECRET` | yes (prod) | Webhook signature verification |
| `WAVE_WEBHOOK_SECRET_PREVIOUS` | optional | Previous secret during rotation |
| `WAVE_API_BASE_URL` | no | Defaults to `https://api.wave.com` |
| `WAVE_REFUND_API_KEY` | optional | Separate credential for refunds |
| `API_BASE_URL` | yes | Public URL Wave can reach for webhooks |

### Webhook URL

Register this endpoint in the Wave merchant dashboard:

```
POST {API_BASE_URL}/api/v1/webhooks/wave
```

The route is mounted **before** `express.json()` so the raw body is available for signature verification.

### Blockers before going live

- **Merchant eligibility** — Wave Checkout must be enabled for your account and currency (XOF).
- **Static egress IP** — Wave may require IP whitelisting for API calls from your server.
- **Credentials** — Valid `WAVE_API_KEY` and webhook signing secret from the Wave dashboard.
- **HTTPS** — Webhook URL must be publicly reachable over HTTPS (use a tunnel like ngrok for staging).

If `PAYMENT_PROVIDER=wave` but `WAVE_API_KEY` is missing:

- **Production** — API fails to start (throws).
- **Development/test** — Logs an error and falls back to the fake provider.

## Background workers

Started automatically in `apps/api/src/index.ts`:

| Worker | Interval | Role |
|--------|----------|------|
| Outbox | 2 s | Processes `fulfil_checkout` and `notify_order_fulfilled` jobs |
| Reconciliation | 60 s | Polls stale open sessions against Wave; enqueues missed fulfilments or expires abandoned orders |

Both workers stop cleanly on `SIGTERM` / `SIGINT`.
