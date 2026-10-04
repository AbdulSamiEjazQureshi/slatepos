# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Restaurant operators, in the middle of service, on shared terminals.

- **Owner / tenant admin** — runs the business across branches; watches sales, margins, stock, staff cost from a desk, phone or the back office.
- **Branch manager** — works the floor; moves between sales, orders, tables, stock and staff during a shift.
- **Cashier** — stands at the counter; the POS is the whole job. Speed is the entire experience. Shared touchscreen terminal, sometimes a barcode scanner.
- **Kitchen staff** — reads the KDS from a distance, hands busy, on a wall or pass screen in a hot, loud kitchen; needs glanceable tickets, not reading.
- **Inventory manager** — reconciles stock, receives goods, transfers between branches, chases reorders.
- **Accountant** — closes the day, expenses, payables, P&L.
- **Delivery manager** — dispatches riders, watches zones and settlements.
- **Staff manager** — rosters, attendance, advances, payroll inputs.
- **Platform admin** — operates the multi-tenant platform across tenants.

## Product Purpose

A Restaurant Operating Management System (ROMS): the whole restaurant in one
place. Take orders and payments, cook them, keep stock and purchasing honest,
cost recipes, run tables and delivery, pay staff, close the books, and report on
all of it — from the counter, the kitchen, and the back office.

Success is a full service run without the software being a thought: a cashier
charges faster than the queue grows, the kitchen never loses a ticket, and the
numbers the owner reads at close match the money in the drawer.

## Positioning

One server-authoritative, multi-tenant platform behind every surface. Pricing,
stock movement, order state and authorization are computed once, on the server,
in exact decimals — never trusted from the client. The POS, the admin, the
kitchen display and a future customer website are all clients of the same typed
API, scoped to tenant and branch at the edge, so a second channel is a new
client rather than a second source of truth.

## Operating Context

- Fast-casual and full-service restaurants, cafés and retail counters in
  Pakistan; the money is rupees, the tax authorities FBR/PRA, the wallets
  JazzCash and Easypaisa.
- Surfaces are used standing, under pressure, often on shared or mounted
  hardware: a touchscreen at the counter, a screen in the kitchen, a laptop in
  the back office. Bright daylight at the counter, glare, greasy fingers, no
  patience.
- More than one terminal hits the same order at once; the kitchen sees changes
  as they happen. Realtime is part of the working loop, not a feature.
- Connectivity is imperfect; a kitchen or counter must keep its place when a
  request is slow.
- The back office is a different rhythm: quieter, denser, longer sessions,
  reading rather than racing.

## Capabilities and Constraints

Confirmed working in the API today (the UI exposes a fraction of this):

- **Sales**: POS, orders with an explicit state machine, split payments,
  refunds, discounts, tips, cash-drawer movements.
- **Floor**: floors, tables, statuses, reservations.
- **Kitchen**: stations, tickets auto-created from orders, prep status, realtime.
- **Catalog**: categories, products, variants, modifier groups, aliases,
  barcodes, per-product tax and cost.
- **Stock**: levels, append-only movements, adjustments, inter-branch transfers.
- **Purchasing**: suppliers, purchase orders, goods receiving → stock + payable,
  supplier payments and ledger, returns.
- **Recipes & production**: versioned recipes, ingredient costing, production runs.
- **Customers**: profiles, groups, loyalty points, wallet balance, ledger.
- **Delivery**: zones, riders, dispatch, statuses, rider settlements.
- **Workforce**: employees, departments, attendance, shifts, leaves, advances,
  employee ledger.
- **Accounting**: chart of accounts, double-entry journal, expenses, cash
  sessions, daily closing, P&L.
- **Reporting**: sales, top products, payment methods, inventory valuation,
  purchases, taxes, customers, kitchen.
- **Online ordering**: per-tenant website, public menu, guest orders.
- **Integrations**: notification providers, idempotent webhooks, tax-provider
  adapters, payment providers.
- **AI**: an assistant limited to explicit, validated tools — never SQL.
- **Access**: tenants, branches, users, granular `resource.action` permissions,
  audit logs, rotating refresh tokens, OTP, password reset.

Constraints that must survive any redesign:

- The SvelteKit app is a **client of a separate Elysia API** (`apis/admin`).
  There are no SvelteKit API routes; every call goes through the typed Eden
  Treaty client and its `unwrap`/`ApiError` contract.
- **Money is exact decimal, never a float** — transported as strings, up to 4
  decimal places, and displayed in PKR.
- Tenant and branch scope is resolved **server-side** from the token and the
  `x-branch-id` header, never from the body. The client's only job is to carry
  the header.
- Enums, DTOs, list envelopes and error shapes are shared contracts in
  `packages/contracts`; the UI must speak them, not invent parallel shapes.
- Errors arrive in one shape (`type`, `message`, `errors`, `requestId`) and must
  be surfaced, not swallowed.

## Brand Commitments

- The platform remains ROMS; the current shell displays **SlatePOS**.
- The implemented, reviewable visual system is **SlatePOS Workspace**, using
  official shadcn-svelte Nova neutral components, self-hosted Inter, neutral
  primary actions, compact navigation, real dropdowns and sheets, and photo menus.
- User acceptance is pending. The user rejected Counter and Service and explicitly
  requested shadcn-svelte; neither discarded world governs new surfaces.
- Light and dark share semantic primitive roles. Legacy tenant branding defaults
  remain API settings, not the shared shell's visual authority.
- Root DESIGN.md and .impeccable/design.json describe current implementation;
  previous source snapshots are preserved under .impeccable/archive/.

## Evidence on Hand

- A seeded demo tenant (`owner@demo.test` / `Password123`) with branches,
  categories, products, tables and users exists as fixture material and as the
  basis for realistic demonstration data.
- Shipping menu and login photography is illustrative stock imagery with source
  sidecars. Menu fallback photography is demo-tenant-only; real tenants supply
  product image URLs. Nothing may invent customers, revenue figures,
  certifications or partners.

## Product Principles

1. **Speed is the feature.** At the counter, every interaction is measured in
   seconds; the interface must reward muscle memory and never make a cashier
   wait for choreography.
2. **The server is the truth.** Totals, stock and permissions are decided
   server-side; the UI reflects, it does not decide.
3. **Glanceable under pressure.** Money, state and time must read from a step
   back, in bad light, without squinting.
4. **One vocabulary across surfaces.** A status, a money figure and a control
   look and behave the same on the POS as in the kitchen as in the back office.
5. **The ledger is sacred.** Nothing that touches money, stock or the books may
   be ambiguous, unconfirmed or silently optimistic.

## Accessibility & Inclusion

- Kitchen and counter surfaces are read at a distance and under time pressure:
  state must never be carried by colour alone (text or shape always accompanies
  it), and interactive targets at the POS are touch-sized.
- Full keyboard operation for back-office tables, forms and navigation, with a
  visible focus ring that belongs to the palette.
