# Architecture

## Guiding principles

- **The backend is the source of truth.** Pricing, stock, discounts and
  authorization are computed server-side; clients never supply them.
- **Feature-based modules, not layered folders.** Each module contains the code
  needed to understand that feature (`*.routes.ts`, `*.service.ts`, `*.schema.ts`).
- **Explicit dependencies.** All infrastructure (db, logger, cache, realtime,
  email) is created once at boot and injected into the Elysia composition.
- **Simple over ceremonial.** No `BaseController`/`GenericRepository`. A feature
  that fits in one file lives in one file.
- **Transactional where it matters.** Orders, payments, stock and transfers run
  in database transactions.

## Request lifecycle

```
HTTP request
  → errorHandlerPlugin (catches everything, maps to one error shape)
  → securityPlugin      (CORS, secure headers, rate-limit macro)
  → authPlugin.derive   (verify JWT → load principal (cached 60s) → build ctx)
  → module guard macros (requireAuth / requireTenant / requirePermission / requireBranch)
  → route handler       (Zod-validated body/query/params)
  → feature service     (business rules, transactions, domain functions)
  → Drizzle → PostgreSQL
```

`ctx` (the `RequestContext`) always carries `requestId`, `userId`, `tenantId`,
`branchId`, `roles`, `permissions` and request metadata. **Tenant and branch ids
are resolved from the token/headers, never from a request body.**

## API composition (`apis/admin/src`)

```
app/
  index.ts            createApp(deps) — composes plugins + modules; exports App type
  deps.ts             AppDeps — db, config, logger, cache, realtime, email
plugins/
  core.ts             decorates the injected dependencies
  auth.ts             ctx derivation + authorization macros
  security.ts         CORS, secure headers, rate limiting
  error-handler.ts    global onError → consistent error body
  openapi.ts          OpenAPI 3.1 + Scalar UI
infrastructure/       logger, cache, realtime hub, email provider, principal loader
lib/                  jwt, tokens, password, audit, http, context helpers
domain/               pure logic: pricing engine, order state machine
modules/<feature>/    routes + services per business capability
```

## Domain layer (pure, testable)

`domain/pricing.ts` is the single pricing engine used by every channel. It
implements the documented order:

```
unit price → modifiers → line subtotal → discount → tax → service charge → tip → delivery → grand total
```

Discounts are allocated across lines proportionally so per-line tax stays
correct, with the rounding remainder assigned to the last line. All money is
`bigint` scaled by 10^4 — **no floating point**.

`domain/order-state.ts` is an explicit state machine
(`DRAFT → CONFIRMED → PREPARING → READY → COMPLETED`, plus `CANCELLED`,
`REFUNDED`, `FAILED`). Illegal transitions return a domain error.

## Stock

Stock only ever changes through `modules/inventory/stock.ts#applyStockMovement`,
which locks the level row (`SELECT … FOR UPDATE`), rejects negative balances and
appends an immutable `stock_movements` record. Orders deduct stock
transactionally on the transition into a sellable state and reverse it on
cancellation.

## Events & realtime

Order/payment/table changes publish typed events to an in-process
`RealtimeHub`, fanned out over the `/api/ws` WebSocket. Clients authenticate the
socket with an access token and are auto-subscribed only to topics they are
allowed to see. Only event contracts (`packages/contracts/src/events.ts`) travel
over the wire — never raw database rows.

## Frontend (`apps/admin/src`)

```
lib/api/client.ts     Eden Treaty client (typed from the API's App type) + ApiError
lib/api/index.ts      feature-level API functions
lib/session.ts        session actions (login/refresh/logout) over Eden
lib/session-store.ts  Svelte stores for token/user/branch (token in memory only)
lib/components/ui/    shadcn-svelte components (button, card, table, input, …)
routes/(app)/...      authenticated workspace: dashboard, POS, orders, products
```

The frontend never calls `fetch` directly: every request goes through Eden
Treaty, which is typed end-to-end from the Elysia route schemas and injects the
auth headers per request. Interactive server state uses TanStack Query.
