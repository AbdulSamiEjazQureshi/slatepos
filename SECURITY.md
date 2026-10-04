# Security

## Authentication

- **Access tokens**: short-lived HS256 JWTs (`ACCESS_TOKEN_TTL`, default 15 min)
  carrying `sub`, `sid`, `tid`, `pa`, `roles`. Signed with `JWT_SECRET`.
- **Refresh tokens**: 48 random bytes, returned once, stored only as a SHA-256
  hash in `sessions`. They rotate on every refresh; reuse of a revoked token
  revokes **all** of the user's sessions (compromise response).
- **Passwords**: Argon2id via Bun's native implementation
  (`memoryCost 19456`, `timeCost 2`).
- **Cookies**: the refresh token is set as an `HttpOnly`, `Secure` (in
  production), `SameSite=Lax` cookie scoped to `/api/v1/auth`. The access token
  is kept **in memory only** on the client — never `localStorage`.
- Password reset and OTP flows store only hashes, with expiry and attempt caps.

## Authorization

- **RBAC**: users hold roles; roles hold granular permissions
  (`orders.create`, `inventory.adjust`, `payments.refund`, …). Wildcard `*`
  (owners/platform admins) expands to all permissions.
- **Custom roles** are supported per tenant.
- Every sensitive route declares its requirement with a macro:
  `requireAuth`, `requireTenant`, `requirePermission('orders.refund')`,
  `requireBranch`.
- Permission changes invalidate the 60-second principal cache immediately.

## Multi-tenant isolation

- `tenant_id` is resolved from the authenticated session; `branch_id` from an
  authorized `x-branch-id` header.
- Every query is scoped by `tenant_id` explicitly in Drizzle; branch access is
  verified against the user's memberships.
- Client-supplied `tenantId`/`branchId`/`userId`/prices/discounts/permissions
  are always ignored.

## Rate limiting

A per-route macro with its own budget — stricter for `login` (10/min),
`register` (5/min), `otp`/`password` (5–10 per 5 min) and refunds.

## Auditing

Append-only `audit_logs` record who/what/when for order, payment, inventory,
product, user and role changes, with request id, IP and user agent. Secrets,
tokens and card data are never logged; Pino `redact` strips auth headers and
token fields.

## Other hardening

- CORS allow-list (`CORS_ORIGINS`) with credentials.
- Secure response headers (`nosniff`, `DENY` framing, referrer policy).
- Structured validation at the HTTP boundary **and** business validation inside
  services; database constraints back up critical invariants.
- Unexpected exceptions are logged and converted to safe responses — stack
  traces are never returned in production.
