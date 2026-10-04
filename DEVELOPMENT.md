# Development

## Prerequisites

- **Bun** ≥ 1.3
- Node ≥ 22 (only for tooling)
- Docker _optional_ — the default PGlite driver needs no database server

## Setup

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run db:seed
bun run dev:api      # http://localhost:3000
bun run dev:admin    # http://localhost:5173
```

### Using a real PostgreSQL server

```bash
docker compose up -d                 # postgres:17 + redis:7
# .env
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://roms:roms@localhost:5432/roms
bun run db:migrate && bun run db:seed
```

## Environment

All configuration is validated by `packages/config` at boot and fails fast with a
readable list of problems. See [`.env.example`](./.env.example). Variables are
loaded from the nearest `.env` walking up from the process cwd, so a single root
`.env` serves every workspace.

## Everyday commands

| Command               | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `bun run dev:api`     | API with `--watch`                                  |
| `bun run dev:admin`   | SvelteKit dev server                                |
| `bun run test`        | all workspace tests                                 |
| `bun run typecheck`   | `tsc` for packages/api + `svelte-check` for the app |
| `bun run lint`        | prettier check                                      |
| `bun run db:generate` | generate SQL from schema changes                    |
| `bun run db:studio`   | Drizzle Studio                                      |

## Testing strategy

- **Domain unit tests** (`bun test`) — money maths, the pricing engine and the
  order state machine are pure and exhaustively tested.
- **HTTP integration tests** (`apis/admin/test/api.integration.test.ts`) run the
  real Elysia app against **real PostgreSQL** (PGlite, in memory, migrations
  applied) and cover:
  - server-authoritative order totals
  - transactional stock deduction
  - illegal state transitions → `422`
  - payment idempotency
  - over-capture rejection
  - tenant isolation
  - permission-based authorization

  ```bash
  cd apis/admin && bun test
  ```

- **Frontend unit tests** — Vitest (`apps/admin`).
- **E2E** — Playwright drives the login → POS → charge workflow:

  ```bash
  cd apps/admin && bunx playwright install chromium && bun run test:e2e
  ```

## Feature development workflow

The repository follows the vertical-slice rule:

```
schema → database → business logic → API → typed client → UI → tests
```

A feature is kept runnable before moving on. Migrations are generated, not
hand-written:

```bash
# edit packages/database/src/schema/*.ts
bun run db:generate
bun run db:migrate
```
