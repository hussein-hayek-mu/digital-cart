# Mahdi's Store

Digital gift-card e-commerce platform — a pnpm + Turborepo monorepo.

## Prerequisites

- **Node.js 22** (see `.nvmrc`)
- **pnpm 9** (enabled via Corepack)

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

| App | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |

## Monorepo Structure

```
.
├── apps/
│   ├── web/          # Next.js 15 storefront
│   └── api/          # Express REST API
├── packages/
│   ├── shared/       # Zod schemas, money utils, constants
│   └── tsconfig/     # Shared TypeScript configs
├── supabase/
│   └── migrations/   # Database migrations
├── docs/             # Architecture & security docs
└── .github/workflows # CI pipeline
```

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm lint` | Lint all packages |
| `pnpm clean` | Remove build artifacts |

## Currency

All monetary values use **XOF** (West African CFA franc) stored as **integer minor units**. XOF has no decimal subdivision — 1 unit = 1 franc.

## Documentation

- [Architecture](docs/architecture.md)
- [Security](docs/security.md)

## License

Private — all rights reserved.
