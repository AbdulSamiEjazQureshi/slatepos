# Readiness and verification

This repository is runnable locally and has automated coverage for core sales
and operational workflows. It is not a certification that all of the original
45-section ROMS specification is complete or safe to deploy without further work.

## Implemented in this revision

- Rebuilt the workspace using official shadcn-svelte Nova components after the
  user rejected both earlier designs: self-hosted Inter, neutral actions, compact
  navigation, menu tabs, photo cards, and a dedicated checkout panel.
- Account/workspace/row actions use Dropdown Menu, selection uses Select,
  command search uses Command, and editing/payment/mobile navigation/checkout
  use Sheet. Short decisions use Dialog. Keyboard navigation and focus return
  are covered by browser tests; the design contract is in DESIGN.md.
- Updated shared typography, buttons, fields, panels, metrics, dialogs, badges,
  tables, dark mode, and touch targets across the management routes.
- POS supports server-side menu search, sorting and pagination, grid/list views,
  variants/modifiers, quantities, notes, discounts, tips, hold/resume on the same
  terminal, and keyboard shortcuts. Held tickets are session-local, not shared
  or guaranteed offline storage.
- Checkout prepares an order for the server total before payment, confirms it
  before payment/kitchen submission, and reuses order/payment idempotency keys
  after an uncertain response. Uncertain submissions lock ticket edits.
- Rotating access-token refresh is shared between HTTP requests and expired
  realtime connections.
  Network failures do not automatically replay mutations.
- Daily sales charts aggregate in SQL with tenant/branch scope and a validated
  time zone/date range. Draft/cancelled orders are excluded from order sales.
  These are order-value reports; refunds are separate, not net cash receipts.
- Realtime subscriptions are scoped to the user's tenant, branch, and read
  permissions. Wildcard roles cannot subscribe to another tenant's topics.
- Local PGlite directories have process ownership locks. API shutdown drains
  requests and bounds long-lived connection shutdown before closing the database.
- Frontend builds to a standalone Node server; see DEPLOYMENT.md.

## Local database incident

The previous `.data/pglite` directory failed startup with an invalid checkpoint.
It was preserved. The local `.env` now uses a fresh, migrated and seeded
`.data/pglite-dev` directory to make development runnable. Existing business data
was not recovered or imported. Recover the previous database from a verified
backup before relying on its historical records.

Demo credentials: `owner@demo.test` / `Password123`. They are development fixtures.

## Checks

Run from the workspace root:

```sh
bun run typecheck
bun run test
bun run build
bun run --filter @roms/admin lint
bun run --filter @roms/admin test:e2e
```

For a preinstalled Chromium-compatible browser, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for the E2E command. Browser captures are
under `apps/admin/.impeccable/review/`.

## Remaining release work

- Verify critical database/concurrency behavior against server PostgreSQL with
  multiple API processes; the integration suite uses embedded PGlite.
- Verify backups/restoration, TLS, origin/cookie policies, deployment secrets,
  observability, resource limits, and operational rollback in the target environment.
- Wire and certify live card/wallet, email/SMS, FBR/PRA, printing/device, and
  delivery integrations. Provider interfaces or internal bookkeeping are not
  equivalent to a live provider integration.
- Implement distributed cache, rate limiting, and realtime pub/sub before
  horizontal API scaling. The running API currently uses memory implementations.
- Audit each module against the original specification. Split payments,
  refunds, returns, reservations, loyalty, payroll, marketing, online ordering,
  hardware, and AI need dedicated end-to-end acceptance checks beyond the core
  cashier flows covered here.
- Conduct a security and accessibility review of the entire platform. Automated
  scans of representative screens do not establish application-wide compliance.
