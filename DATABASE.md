# Database

PostgreSQL with Drizzle ORM. The schema lives in
`packages/database/src/schema/` and is the source of truth for migrations.

## Drivers

| Driver               | When           | Notes                                                                               |
| -------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `pglite` _(default)_ | dev, tests, CI | Real PostgreSQL compiled to WASM, runs in-process. No Docker. Data at `PGLITE_DIR`. |
| `postgres`           | production     | `postgres.js` against a server via `DATABASE_URL`.                                  |

`createDatabase()` in `packages/database/src/client.ts` picks the driver and
exposes a single `Db` type, so application code is driver-agnostic.
`createTestDatabase()` (from `@roms/database/testing`) gives tests an in-memory
Postgres with all migrations applied.

## Conventions

- **UUID primary keys** (`gen_random_uuid()`).
- **`tenant_id` + `branch_id`** on every tenant-owned row, with indexes matching
  real query patterns (e.g. `orders(branch_id, status, created_at)`).
- **Money**: `numeric(14,4)`, transported as decimal strings, computed as
  `bigint` scaled by 10^4 — never floating point.
- **Rates** (tax, discount, service charge): `numeric(8,4)`.
- **Timestamps**: `timestamptz`, stored in UTC.
- **Soft delete** only where history matters (`products.status = ARCHIVED`,
  `categories.is_active`). Transactional rows (payments, stock movements, audit
  logs, ledger entries) are append-only and never deleted.
- **Constraints**: unique SKU/barcode per tenant (partial indexes where the
  column is nullable), unique payment idempotency key per tenant, positive
  quantities enforced in `applyStockMovement`.

## Tables (70)

`tenants`, `branches`, `users`, `roles`, `user_roles`, `user_branches`,
`sessions`, `verification_tokens`, `otp_codes`, `audit_logs`, `document_counters`,
`categories`, `products`, `product_variants`, `modifier_groups`,
`modifier_options`, `product_modifier_groups`, `customers`, `floors`,
`restaurant_tables`, `reservations`, `orders`, `order_items`,
`order_item_modifiers`, `order_counters`, `payments`, `refunds`,
`idempotency_keys`, `cash_movements`, `stock_levels`, `stock_movements`,
`suppliers`, `purchase_orders`, `purchase_order_items`, `goods_receipts`,
`goods_receipt_items`, `supplier_payments`, `supplier_ledger_entries`,
`purchase_returns`, `purchase_return_items`, `recipes`, `recipe_items`,
`production_runs`, `kitchen_stations`, `kitchen_tickets`, `delivery_zones`,
`riders`, `deliveries`, `rider_settlements`, `departments`, `employees`,
`attendance`, `shifts`, `leave_requests`, `employee_advances`,
`employee_ledger_entries`, `accounts`, `journal_entries`, `journal_lines`,
`expenses`, `cash_drawer_sessions`, `daily_closings`, `customer_ledger_entries`,
`website_settings`, `website_pages`, `notifications`, `webhook_events`,
`tax_invoices`, `ai_conversations`, `ai_messages`.

## Migrations

```bash
bun run db:generate   # drizzle-kit generate → packages/database/drizzle/*.sql
bun run db:migrate    # apply
```

Migration SQL is committed. `drizzle-kit generate` needs no live database.

## Transactions & concurrency

- Order creation, order edits, stock movements, payments and refunds run inside
  transactions.
- Order numbers are allocated with an atomic upsert on `order_counters`.
- Stock levels are locked with `SELECT … FOR UPDATE` before mutation.
- `orders.version` provides optimistic concurrency for edits
  (`concurrency_conflict` on mismatch).
- Payments and refunds are idempotent via `idempotencyKey`.
