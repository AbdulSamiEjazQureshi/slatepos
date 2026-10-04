# ROMS — Restaurant Operating Management System

A multi-tenant restaurant platform built as a Bun workspace. See [READINESS.md](./READINESS.md) for verified behavior and remaining production work.
a **separate ElysiaJS API** (`apis/admin`) and a **SvelteKit admin/POS app**
(`apps/admin`), sharing contracts and a Drizzle/PostgreSQL data layer.

The backend is the single source of truth. Validation, pricing, stock movement,
tenant isolation and authorization all happen server-side; clients — POS,
admin, and any future website/mobile — consume the same typed API.

## Architecture at a glance

```
SvelteKit (apps/admin)          ElysiaJS API (apis/admin)
  Eden Treaty client  ────────▶  /api/v1/...
  shadcn-svelte UI               plugins: config · db · auth · security · errors
  TanStack Query                 modules: auth · tenants · branches · users · roles
                                          catalog · orders · payments · inventory
                                          tables · customers · reports · realtime
                                          │
                     PostgreSQL (Drizzle ORM)  ·  in-process cache  ·  WebSocket hub
```

## Modules

| Domain               | Capability                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Auth & tenancy       | login, rotating refresh tokens, sessions, OTP, password reset; tenants, branches, users, roles, permissions, audit |
| Catalog & POS        | categories, products, variants, modifier groups, branch search, POS                                                |
| Orders               | server-authoritative pricing engine, explicit state machine, edited orders                                         |
| Payments             | cash/card/bank/JazzCash/Easypaisa, split payments, idempotent capture, refunds, cash drawer                        |
| Inventory            | stock levels, append-only movements, adjustments, inter-branch transfers                                           |
| Purchasing           | suppliers, purchase orders, goods receiving → stock + payable, supplier payments/ledger, returns                   |
| Recipes & production | versioned recipes, ingredient costing, production runs that consume/produce stock                                  |
| Kitchen (KDS)        | stations, tickets auto-created from orders, prep status flow, realtime                                             |
| Tables               | floors, tables, status, reservations                                                                               |
| Delivery             | zones, riders, dispatch, status, rider settlements, provider adapter                                               |
| Workforce            | employees, departments, attendance, shifts, leaves, advances, employee ledger, biometric adapter                   |
| Accounting           | chart of accounts, double-entry journal, expenses, cash sessions, daily closing, P&L, customer ledger              |
| Reporting            | sales, top products, payment methods, daily summaries (server-side aggregation)                                    |
| Online ordering      | per-tenant website settings, structured pages/sections, public menu + guest orders                                 |
| Integrations         | notification providers, idempotent webhooks, tax-provider adapters (FBR/PRA), payment providers                    |
| AI                   | isolated assistant limited to explicit, validated tools — never SQL access                                         |

## Stack

| Layer    | Choice                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| Runtime  | Bun                                                                                 |
| Backend  | ElysiaJS 1.4, Zod (Standard Schema), Drizzle ORM, PostgreSQL                        |
| Auth     | HS256 JWT access tokens + rotating hashed refresh tokens, Argon2id (`Bun.password`) |
| Docs     | OpenAPI 3.1 generated from route schemas, Scalar UI at `/api/openapi`               |
| Frontend | SvelteKit, Svelte 5 runes, Tailwind v4, Bits UI, TanStack Query, Eden Treaty        |
| Realtime | Elysia WebSockets                                                                   |
| Tests    | `bun test` (domain + HTTP integration on PGlite), Vitest, Playwright                |

## Workspace layout

```
ps/
├── apps/admin/          # SvelteKit admin + POS (Eden client, shared UI components)
├── apis/admin/          # ElysiaJS API (the separate backend)
├── packages/
│   ├── contracts/       # Zod schemas, DTOs, enums, permissions, event contracts
│   ├── config/          # Typed environment configuration + .env loader
│   ├── database/        # Drizzle schema, client, migrations, seed, test db
│   └── utils/           # Result, money (no floats), ids, pagination, dates
├── docker-compose.yml   # PostgreSQL + Redis
├── .env.example
└── package.json         # Bun workspace root
```

## Quick start

```bash
bun install
cp .env.example .env          # defaults to the zero-setup PGlite driver

bun run db:migrate            # apply migrations
bun run db:seed               # demo tenant, products, tables, users

bun run dev:api               # http://localhost:3000  (Scalar docs at /api/openapi)
bun run dev:admin             # http://localhost:5173
```

Sign in with `owner@demo.test` / `Password123`.

> The default `DATABASE_DRIVER=pglite` runs **real PostgreSQL** compiled to WASM
> in-process, so no Docker is required for development. Set
> `DATABASE_DRIVER=postgres` + `DATABASE_URL` for a server — see
> [DATABASE.md](./DATABASE.md).

## Commands

```bash
bun run dev / dev:api / dev:admin     # run applications
bun run build / build:api / build:admin
bun run test                          # all workspace tests
bun run typecheck                     # tsc + svelte-check across workspaces
bun run lint                          # prettier
bun run db:generate                   # new migration from schema changes
bun run db:migrate / db:seed / db:push / db:studio
docker compose up -d                  # PostgreSQL + Redis
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — modules, plugins, request lifecycle, events
- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup, workflows, testing
- [DATABASE.md](./DATABASE.md) — schema, money, multi-tenancy, migrations
- [API.md](./API.md) — REST conventions, errors, pagination, OpenAPI/Eden
- [SECURITY.md](./SECURITY.md) — auth, authorization, tenant isolation
- [DEPLOYMENT.md](./DEPLOYMENT.md) — production topology and configuration
# slatepos
# slatepos
