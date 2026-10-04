# API

Base path: `/api/v1`. The API is a **separate ElysiaJS application**
(`apis/admin`) — the SvelteKit app never serves API routes.

## Documentation

Route schemas (Zod, via Standard Schema) generate the OpenAPI 3.1 document:

- Scalar UI — `http://localhost:3000/api/openapi`
- Raw spec — `http://localhost:3000/api/openapi/json`

## Conventions

- REST verbs (`GET`/`POST`/`PUT`/`PATCH`/`DELETE`).
- Successful responses return the resource or a list envelope.
- Every error returns **one shape**:

```json
{
  "type": "validation_error",
  "message": "Invalid order",
  "errors": { "items": ["Product is unavailable"] },
  "requestId": "2f1c…"
}
```

- List endpoints support `page`, `pageSize`, `sort`, `order` and (where useful)
  `q`, and return `{ items, meta: { page, pageSize, total, totalPages, hasNext, hasPrevious } }`.
- Tenant/branch scope is resolved from the access token and the `x-branch-id`
  header — never from the body.

## Endpoints

| Area         | Path                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health       | `GET /health/live`, `GET /health/ready`                                                                                                                                                                                                                                                                                                                               |
| Auth         | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/otp/request`, `/auth/otp/verify`                                                                                                                                    |
| Tenants      | `GET/POST /tenants`, `GET/PATCH /tenants/current`, `GET /tenants/:id`                                                                                                                                                                                                                                                                                                 |
| Branches     | `GET/POST /branches`, `GET/PATCH /branches/:id`                                                                                                                                                                                                                                                                                                                       |
| Users        | `GET/POST /users`, `GET/PATCH /users/:id`                                                                                                                                                                                                                                                                                                                             |
| Roles        | `GET/POST /roles`, `PATCH /roles/:id`                                                                                                                                                                                                                                                                                                                                 |
| Audit        | `GET /audit-logs`                                                                                                                                                                                                                                                                                                                                                     |
| Catalog      | `GET/POST /categories`, `/categories/:id`; `GET/POST /products`, `GET /products/search`, `/products/:id`                                                                                                                                                                                                                                                              |
| Orders       | `GET/POST /orders`, `GET/PATCH /orders/:id`, `POST /orders/:id/status`, `POST /orders/:id/items/:itemId/status`                                                                                                                                                                                                                                                       |
| Payments     | `GET/POST /payments`, `POST /payments/:id/refund`, `POST /payments/cash-movements`                                                                                                                                                                                                                                                                                    |
| Inventory    | `GET /inventory/stock`, `GET /inventory/movements`, `POST /inventory/adjust`, `POST /inventory/transfer`                                                                                                                                                                                                                                                              |
| Tables       | `GET/POST /tables/floors`, `GET/POST /tables`, `PATCH /tables/:id`, `POST /tables/:id/status`, `GET/POST /tables/reservations`                                                                                                                                                                                                                                        |
| Customers    | `GET/POST /customers`, `GET/PATCH /customers/:id`                                                                                                                                                                                                                                                                                                                     |
| Reports      | `GET /reports/sales-summary`, `/reports/top-products`, `/reports/payment-methods`                                                                                                                                                                                                                                                                                     |
| Purchasing   | `GET/POST /purchasing/suppliers`, `PATCH /purchasing/suppliers/:id`, `GET /purchasing/suppliers/:id/ledger`, `POST /purchasing/suppliers/payments`, `GET/POST /purchasing/purchase-orders`, `GET /purchasing/purchase-orders/:id`, `POST /purchasing/purchase-orders/:id/status`, `POST /purchasing/purchase-orders/:id/receive`, `POST /purchasing/purchase-returns` |
| Recipes      | `GET/POST /recipes`, `GET /recipes/:id`, `POST /recipes/:id/status`, `POST /recipes/:id/produce`, `GET /recipes/production/runs`                                                                                                                                                                                                                                      |
| Kitchen      | `GET/POST /kitchen/stations`, `GET /kitchen/tickets`, `POST /kitchen/tickets/:id/status`, `POST /kitchen/tickets/:id/priority`                                                                                                                                                                                                                                        |
| Delivery     | `GET/POST /delivery/zones`, `GET/POST /delivery/riders`, `GET/POST /delivery/deliveries`, `POST /delivery/deliveries/:id/rider`, `POST /delivery/deliveries/:id/status`, `POST /delivery/settlements`                                                                                                                                                                 |
| Workforce    | `GET/POST /workforce/departments`, `GET/POST /workforce/employees`, `PATCH /workforce/employees/:id`, `GET /workforce/employees/:id/ledger`, `GET/POST /workforce/attendance`, `GET/POST /workforce/shifts`, `POST /workforce/leaves`, `POST /workforce/leaves/:id/status`, `POST /workforce/advances`                                                                |
| Accounting   | `GET /accounting/accounts`, `POST /accounting/accounts/seed`, `GET/POST /accounting/expenses`, `GET /accounting/journal`, `POST /accounting/cash-sessions`, `POST /accounting/cash-sessions/:id/close`, `POST /accounting/daily-closing`, `GET /accounting/daily-closings`, `GET /accounting/profit-loss`, `GET /accounting/customers/:id/ledger`                     |
| Website      | `GET/PATCH /website/settings`, `GET/PUT /website/pages`, `DELETE /website/pages/:slug`                                                                                                                                                                                                                                                                                |
| Public       | `GET /public/site/:slug`, `GET /public/site/:slug/menu`, `POST /public/site/:slug/orders`                                                                                                                                                                                                                                                                             |
| Integrations | `GET/POST /integrations/notifications`, `POST /integrations/notifications/:id/read`, `POST /integrations/webhooks/:provider`, `GET /integrations/webhooks`, `GET /integrations/tax-invoices`                                                                                                                                                                          |
| AI           | `GET /ai/tools`, `POST /ai/query`, `GET /ai/conversations`, `GET /ai/conversations/:id`                                                                                                                                                                                                                                                                               |
| Realtime     | `WS /api/ws?token=…`                                                                                                                                                                                                                                                                                                                                                  |

## Typed client — Eden Treaty

The frontend consumes the API through Eden, typed from the app's own schema:

```ts
import { treaty } from '@elysia/eden';
import type { App } from '@roms/api/app';

export const eden = treaty<App>(API_URL, {
  fetch: { credentials: 'include' },
  headers: () => authHeaders() // injected per request
});

const order = await eden.api.v1.orders.post({
  items: [{ productId, quantity: 1, modifiers: [] }],
  tip: '0'
});
```

Eden exposes dynamic params as calls
(`eden.api.v1.orders({ id }).status.post({ status })`) and keeps the whole
request/response contract in sync — there are no hand-written client DTOs.

## Realtime events

Typed event contracts only (`packages/contracts/src/events.ts`):
`order.created`, `order.status_changed`, `order.item_status_changed`,
`table.status_changed`, `payment.status_changed`, `notification.created`.
Subscriptions are restricted to the caller's branches.
