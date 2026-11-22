# Architecture

> Phase 0 placeholder — to be expanded in later phases.

## Overview

Mahdi's Store is a digital gift-card e-commerce platform built as a pnpm + Turborepo monorepo.

## Monorepo Layout

| Package / App | Purpose |
|---|---|
| `apps/web` | Next.js 15 storefront (App Router) |
| `apps/api` | Express REST API |
| `packages/shared` | Zod schemas, money utilities, constants |
| `packages/tsconfig` | Shared TypeScript configurations |
| `supabase/migrations` | Database migrations (Supabase) |

## Data Flow (Planned)

```
Browser → apps/web → apps/api → Supabase
                         ↓
                   Payment Provider
```

## Tech Stack

- **Runtime:** Node.js 22
- **Package manager:** pnpm 9 (via Corepack)
- **Build orchestration:** Turborepo
- **Frontend:** Next.js 15, React 19, TypeScript
- **Backend:** Express, TypeScript
- **Database:** Supabase (PostgreSQL)
- **Validation:** Zod
- **Currency:** XOF (integer francs, no decimals)

## Phase Roadmap

- **Phase 0** — Monorepo scaffold (current)
- **Phase 1** — Product catalog, cart, checkout
- **Phase 2** — Payment integration, order fulfillment
- **Phase 3** — Admin dashboard, analytics
