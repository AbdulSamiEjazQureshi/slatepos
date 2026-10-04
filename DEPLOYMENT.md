# Deployment

## Topology

```
        ┌────────────┐        ┌────────────┐
        │ SvelteKit  │  ───▶  │ ElysiaJS   │
        │  apps/admin│  Eden  │  apis/admin│
        └────────────┘        └─────┬──────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
            PostgreSQL          Redis (opt.)     External providers
                                                 (payments, FBR/PRA,
                                                  email, delivery)
```

The two applications deploy independently. The SvelteKit app only needs
`VITE_API_URL`; the API needs the database and secrets.

## Build & run

```bash
bun install

# API
cd apis/admin && bun run build && bun run dist/index.js   # or: bun run src/index.ts

# Web
cd apps/admin && bun run build
ORIGIN=https://admin.example.com HOST=0.0.0.0 PORT=3001 bun run start
```

## Configuration

API runtime config is environment-driven and validated at boot
(see `.env.example`). Minimum production set:

```
NODE_ENV=production
JWT_SECRET=<32+ random bytes>
DATABASE_DRIVER=postgres
DATABASE_URL=postgres://user:pass@host:5432/roms
CORS_ORIGINS=https://admin.example.com
VITE_API_URL=https://api.example.com       # supplied when building the frontend
```

The frontend uses the standalone SvelteKit Node adapter. `VITE_API_URL` is baked
into the client build; set it before `bun run build`. `ORIGIN`, `HOST`, and
`PORT` configure the production web server. `vite preview` is for build inspection.
Run the API and web server separately behind a TLS reverse proxy.

External email and payment providers must be configured and verified before
using password-reset delivery or taking live provider payments. The console
email provider and internal payment records do not constitute a live integration.

## Database

```bash
DATABASE_DRIVER=postgres DATABASE_URL=… bun run db:migrate
DATABASE_DRIVER=postgres DATABASE_URL=… bun run db:seed   # dev only
```

Run migrations as a release step, before starting new API instances.

## Docker Compose (local / staging)

`docker compose up -d` starts PostgreSQL 17 and Redis 7 with health checks and
persistent volumes. Point `DATABASE_URL` at `localhost:5432`.

## Operational notes

- **Logs** are structured JSON (Pino) including `requestId`, `tenantId`,
  `userId`, operation and duration — suitable for shipping to any log pipeline.
- **Health**: `GET /api/v1/health/live` (process) and `/health/ready`
  (checks the database) for orchestrator probes.
- **Scaling**: cache, rate limiting, and the realtime hub currently run in-process.
  Setting `REDIS_URL` alone does not install distributed implementations. Use
  one API instance until shared state and pub/sub adapters are implemented and
  tested. Use server PostgreSQL for production; PGlite is local development only.
- **Realtime**: the WebSocket hub is in-process, so sticky sessions (or a
  shared pub/sub adapter) are required when scaling horizontally.
- Never commit secrets; `.env` is git-ignored and `.env.example` documents the
  required variables.
