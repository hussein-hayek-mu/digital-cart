# Security

> Phase 0 placeholder — to be expanded in later phases.

## Principles

1. **No secrets in source control** — use `.env` locally; CI uses GitHub Secrets.
2. **Least privilege** — Supabase Row Level Security (RLS) on all tables.
3. **Input validation** — Zod schemas at API boundaries.
4. **HTTPS only** in production.
5. **Webhook signature verification** for payment provider callbacks.

## Environment Variables

See `.env.example` for required variables. Never commit real values.

| Variable | Scope | Notes |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Never expose to client |
| `NEXT_PUBLIC_*` | Client-safe | Only non-sensitive public config |
| `PAYMENT_PROVIDER_*` | Server only | API keys and webhook secrets |

## Planned Controls (Phase 1+)

- [ ] Rate limiting on API endpoints
- [ ] CSRF protection for web forms
- [ ] Content Security Policy headers
- [ ] Audit logging for order/payment events
- [ ] Dependency vulnerability scanning in CI
