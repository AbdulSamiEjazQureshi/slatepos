# Restaurant Operating Management System — Development Prompt

Build a production-grade, multi-tenant **Restaurant Operating Management System (ROMS)** using the following stack.

The application must be designed as one coherent platform while keeping individual business modules independently understandable and maintainable.

Prioritize:

- correctness
- tenant isolation
- transactional consistency
- POS performance
- maintainability
- simple architecture
- type safety
- functional programming patterns where practical
- incremental development
- excellent developer experience

Do not introduce abstractions merely for architectural ceremony.

---

# 1. Technology Stack

## Frontend

Use:

- **SvelteKit** — latest stable version
- **Svelte 5** — latest stable version
- **TypeScript** — latest stable version
- **Tailwind CSS** — latest stable version
- **shadcn-svelte** — latest stable version/components
- **Bits UI / Melt UI** where shadcn-svelte requires lower-level primitives
- **Lucide Svelte** for icons
- **TanStack Query for Svelte** for server state
- **Svelte stores / Svelte 5 runes** for client state
- **Superforms** for complex forms where useful
- **Zod** for validation
- **native `fetch`** for HTTP communication
- **svelte-sonner** for notifications
- **TanStack Table for Svelte** for complex data tables
- **date-fns** for date manipulation
- **LayerChart / Apache ECharts** for dashboards and charts where appropriate

Use modern SvelteKit patterns.

Prefer:

```text
SvelteKit Server Load
        ↓
Server-side data loading where appropriate
        ↓
Svelte components
        ↓
Client-side state only when interaction requires it
```

Do not turn the entire application into client-side JavaScript unnecessarily.

Prefer Svelte 5 runes and modern Svelte syntax.

Use:

```svelte
<script lang="ts">
	let count = $state(0);

	const doubled = $derived(count * 2);
</script>
```

where appropriate.

Do not create unnecessary global stores.

---

# 2. Backend

Use:

- **Bun** — latest stable version
- **TypeScript**
- **ElysiaJS** — latest stable version
- **Drizzle ORM** — latest stable version
- **PostgreSQL**
- **postgres.js or Bun SQL** where direct SQL provides a meaningful benefit
- **Zod** for validation
- **Elysia OpenAPI**
- **Scalar** for API documentation
- **JWT**
- **secure refresh-token mechanism**
- **Argon2id** for password hashing
- **Pino** or another structured logger
- **Redis** only where distributed caching/state provides real value
- **WebSocket support through Elysia**
- **Bun-compatible scheduling/background job solution**
- **Resend/SMTP/provider abstraction** for email where required
- **provider abstractions** for SMS, WhatsApp and push notifications

Use Bun-native APIs where they provide clear benefits.

Do not introduce Node-specific packages when a Bun-native or Web-standard API is sufficient.

Prefer:

```text
Web APIs
Bun APIs
Elysia APIs
```

over unnecessary compatibility layers.

---

# 3. Monorepo

Prefer a Bun workspace/monorepo.

Recommended structure:

```text
roms/
├── apps/
│   ├── web/
│   │   └── SvelteKit
│   │
│   └── api/
│       └── ElysiaJS
│
├── packages/
│   ├── contracts/
│   ├── validation/
│   ├── database/
│   ├── auth/
│   ├── ui/
│   ├── config/
│   └── utils/
│
├── docker/
├── scripts/
├── package.json
├── bun.lock
├── docker-compose.yml
└── README.md
```

Use shared packages where they genuinely reduce duplication.

Especially share:

```text
API schemas
validation schemas
DTO/contracts
enums
domain primitives
API error types
```

between frontend and backend where appropriate.

Do not put server-only database code into packages consumed by SvelteKit client code.

---

# 4. Architecture

Use a **modular feature-based architecture**.

Do not create one enormous:

```text
controllers/
services/
repositories/
models/
```

structure.

Prefer:

```text
apps/api/src/
├── app/
│
├── modules/
│   ├── auth/
│   ├── tenants/
│   ├── branches/
│   ├── products/
│   ├── orders/
│   ├── payments/
│   ├── inventory/
│   ├── purchasing/
│   ├── recipes/
│   ├── kitchen/
│   ├── tables/
│   ├── customers/
│   ├── delivery/
│   ├── workforce/
│   ├── accounting/
│   ├── reporting/
│   ├── notifications/
│   ├── administration/
│   ├── integrations/
│   └── ai/
│
├── infrastructure/
│   ├── database/
│   ├── cache/
│   ├── logging/
│   ├── storage/
│   └── realtime/
│
├── middleware/
├── plugins/
└── index.ts
```

Each feature should contain the code needed to understand that feature.

For example:

```text
modules/orders/
├── order.routes.ts
├── order.schema.ts
├── order.service.ts
├── order.repository.ts
├── order.types.ts
├── order.events.ts
└── index.ts
```

Do not create these files mechanically if the feature is small.

A feature may simply contain:

```text
orders.ts
```

if that is genuinely sufficient.

---

# 5. Backend Programming Style

Prefer modern TypeScript.

Use:

```text
type
interface
const
readonly
satisfies
discriminated unions
generics
async/await
Result-like return values where useful
pure functions
composition
dependency injection through closures/factories
```

Prefer immutable data.

Example:

```ts
export const createProduct = async (
  input: CreateProductInput,
  ctx: RequestContext
): Promise<Result<Product, DomainError>> => {
  // ...
};
```

Prefer functions and composition over large classes.

Avoid excessive OOP.

Avoid deep inheritance.

Avoid service classes containing hundreds of methods.

Prefer:

```text
small functions
small modules
explicit dependencies
feature-local logic
```

---

# 6. ElysiaJS Architecture

Use Elysia plugins to compose the application.

Example conceptual structure:

```ts
const app = new Elysia()
  .use(requestContext)
  .use(authPlugin)
  .use(tenantPlugin)
  .use(productsModule)
  .use(ordersModule)
  .use(inventoryModule)
  .use(paymentModule)
  .listen(PORT);
```

Feature modules should expose their routes through Elysia plugins.

Example:

```ts
export const productsModule = new Elysia({
  prefix: "/api/v1/products"
})
  .get("/", getProducts)
  .post("/", createProduct, {
    body: createProductSchema
  });
```

Keep authentication and authorization middleware close to the API boundary.

Do not allow route handlers to become giant business-logic functions.

---

# 7. API Design

Use REST APIs.

Base path:

```text
/api/v1
```

Examples:

```text
/api/v1/auth
/api/v1/tenants
/api/v1/branches
/api/v1/products
/api/v1/categories
/api/v1/orders
/api/v1/payments
/api/v1/inventory
/api/v1/purchases
/api/v1/suppliers
/api/v1/customers
/api/v1/tables
/api/v1/kitchen
/api/v1/delivery
/api/v1/staff
/api/v1/accounting
/api/v1/reports
```

Use:

```text
GET
POST
PUT
PATCH
DELETE
```

appropriately.

Return consistent API responses.

Support:

```text
pagination
sorting
filtering
search
validation errors
domain errors
concurrency errors
authorization errors
```

Use a consistent error structure.

Example:

```json
{
	"type": "validation_error",
	"message": "Invalid order",
	"errors": {
		"items": ["Product is unavailable"]
	}
}
```

Elysia validation should be used at the HTTP boundary.

Business validation must still happen inside the application logic.

---

# 8. OpenAPI

Generate OpenAPI documentation from Elysia schemas.

Expose Scalar documentation.

Example:

```text
/api/docs
/api/openapi.json
```

The API contract should be generated from actual schemas wherever possible.

Avoid maintaining a completely separate manually-written API specification.

---

# 9. Authentication & Authorization

Implement:

```text
Login
Logout
Refresh Token
Password Reset
Email Verification
OTP Verification
Session Management
```

Use:

```text
short-lived access token
+
secure refresh token
```

Refresh tokens must support rotation/revocation.

Never store raw refresh tokens if avoidable.

Store a secure hash/reference.

Support:

```text
role-based authorization
permission-based authorization
```

Example permissions:

```text
orders.read
orders.create
orders.update
orders.cancel

products.read
products.create
products.update
products.delete

inventory.read
inventory.adjust

reports.read

staff.read
staff.manage

payments.refund
payments.manage
```

Every sensitive backend operation must perform authorization.

Do not rely on SvelteKit route protection alone.

---

# 10. Multi-Tenant Architecture

Hierarchy:

```text
Platform
    ↓
Tenant / Brand
    ↓
Branch
    ↓
Users
```

Every tenant-owned entity must contain appropriate tenant context.

Typical structure:

```text
tenant_id
branch_id
```

where appropriate.

Never trust these values from the client.

Resolve tenant/branch context from:

```text
authenticated session
host/subdomain
server-side authorization
```

as appropriate.

Tenant isolation must be enforced at the backend/database boundary.

Consider PostgreSQL Row-Level Security for particularly sensitive deployments, but do not introduce it purely for architectural fashion.

Drizzle queries should explicitly enforce tenant scope where appropriate.

Example:

```ts
db
  .select()
  .from(products)
  .where(
    and(
      eq(products.tenantId, ctx.tenantId),
      eq(products.branchId, ctx.branchId)
    )
  );
```

Do not depend exclusively on frontend filtering.

---

# 11. Database

Use:

```text
PostgreSQL
Drizzle ORM
Drizzle migrations
```

Design proper:

```text
foreign keys
indexes
unique constraints
check constraints
transactions
concurrency controls
```

Pay particular attention to:

```text
tenant_id
branch_id
created_at
updated_at
deleted_at
```

where applicable.

Use UUIDs or another appropriate globally unique identifier.

Do not add `deleted_at` to every table automatically.

Use soft deletion only where business requirements justify it.

Avoid unnecessary JSON columns.

Use PostgreSQL JSON/JSONB when the data is genuinely dynamic.

---

# 12. Database Transactions

Financial and inventory operations must be transactional.

Example:

```text
Create order
↓
Reserve/deduct inventory
↓
Create payment
↓
Create accounting records
↓
Commit
```

If a critical operation fails:

```text
ROLLBACK
```

Use database transactions for:

```text
payments
refunds
inventory movements
purchase receiving
stock transfers
order completion
financial closing
```

Do not rely on application-level assumptions for atomic operations.

---

# 13. Concurrency

POS and inventory operations must be concurrency-safe.

Examples:

```text
Two cashiers selling the same item
Two users editing the same product
Two users adjusting inventory
Two payments completing simultaneously
Two users modifying the same order
```

Use:

```text
database transactions
optimistic concurrency
row locking where justified
atomic updates
unique constraints
idempotency keys
```

Payment operations must be idempotent.

Webhook processing must also be idempotent.

---

# 14. POS

Implement:

```text
Quick product search
Barcode scanning
Categories
Variants
Modifiers
Add-ons
Combos
Cart
Hold order
Resume order
Discounts
Taxes
Tips
Multiple payment methods
Split payments
Partial payments
Refunds
Returns
Receipts
Cash drawer
Order cancellation
Order notes
```

POS must prioritize speed.

Avoid unnecessary network requests.

Use cached catalog data where appropriate.

Keyboard shortcuts:

```text
F2 → Search
F4 → Payment
F8 → Hold
ESC → Cancel
```

Support barcode scanners as keyboard-emulation devices.

The POS should remain usable with touchscreens.

---

# 15. Order Management

Support:

```text
Dine-in
Takeaway
Delivery
Online order
Scheduled order
Order status
Order history
Order notes
Order cancellation
Order refund
Order tracking
```

Use an explicit state machine.

Example:

```text
DRAFT
↓
CONFIRMED
↓
PREPARING
↓
READY
↓
COMPLETED
```

with appropriate alternate states:

```text
CANCELLED
REFUNDED
FAILED
```

Do not allow arbitrary invalid status transitions.

Keep order-state transitions in explicit business logic.

---

# 16. Tables & Restaurant Floor

Implement:

```text
Floors
Tables
Table capacity
Table status
Table merging
Table splitting
Table transfer
Reservations
Dine-in orders
```

Support realtime table updates through WebSockets.

Example:

```text
AVAILABLE
OCCUPIED
RESERVED
CLEANING
OUT_OF_SERVICE
```

---

# 17. Kitchen Display System

Build a KDS module.

Support:

```text
Kitchen stations
Kitchen orders
Order tickets
Preparation status
Priority
Timers
Completed items
Delayed orders
```

Example:

```text
NEW
↓
PREPARING
↓
READY
↓
SERVED
```

Use Elysia WebSockets for realtime events.

Avoid polling for normal KDS updates.

---

# 18. Catalog

Support:

```text
Categories
Products
Variants
Sizes
Modifiers
Add-ons
Combos
Bundles
Pricing
Branch-specific pricing
Availability
Taxes
Images
Descriptions
SKU
Barcode
```

Products should be reusable across:

```text
POS
Website
Mobile App
Delivery
Reports
AI
```

The backend is the source of truth.

---

# 19. Inventory

Implement:

```text
Stock
Stock movements
Stock adjustments
Stock transfers
Low-stock alerts
Inventory valuation
Warehouses
Branch inventory
Units
Wastage
Expiry
Batch tracking
```

Every stock modification must create an auditable stock movement.

Never simply do:

```ts
product.stock -= quantity;
```

without recording why the movement occurred.

Use a movement model such as:

```text
PURCHASE
SALE
RETURN
ADJUSTMENT
TRANSFER_IN
TRANSFER_OUT
WASTAGE
PRODUCTION
REVERSAL
```

Stock quantity and stock movement history must remain consistent.

---

# 20. Purchasing

Implement:

```text
Suppliers
Purchase orders
Purchase receiving
Purchase invoices
Supplier payments
Purchase returns
Supplier ledger
```

Workflow:

```text
Purchase Order
→ Receiving
→ Inventory Update
→ Supplier Payable
```

Receiving should create inventory movements transactionally.

---

# 21. Recipes & Production

Support restaurant recipe management.

Example:

```text
Chicken Burger
    ├── Bun × 1
    ├── Chicken Patty × 1
    ├── Sauce × 20g
    └── Cheese × 1
```

Implement:

```text
Recipes
Ingredients
Recipe versions
Recipe costing
Production
Semi-finished products
Wastage
Yield
Portion sizes
```

Calculate:

```text
theoretical food cost
actual food cost
variance
```

where sufficient data exists.

Recipe versions must be immutable once used for historical transactions, or otherwise versioned in a way that preserves historical accuracy.

---

# 22. Customers / CRM

Implement:

```text
Customer profiles
Phone/email
Order history
Customer notes
Customer groups
Loyalty points
Wallet/credit
Customer ledger
```

Design provider integrations for:

```text
WhatsApp
SMS
Email
Push notifications
```

without coupling the CRM domain to a specific provider.

---

# 23. Discounts & Promotions

Support:

```text
Percentage discounts
Fixed discounts
Product discounts
Category discounts
BOGO
Combo offers
Happy hours
Coupons
Promo codes
Branch-specific promotions
Customer-specific promotions
Minimum-order promotions
```

Every promotion should define:

```text
start date
end date
usage limits
eligibility rules
applicable branches
applicable products
```

Promotion evaluation must happen server-side.

Never trust a discount amount calculated by the frontend.

---

# 24. Delivery

Implement:

```text
Delivery zones
Delivery charges
Riders
Rider assignment
Delivery status
Rider settlements
Delivery addresses
```

Design an adapter system for external delivery providers.

Example:

```text
DeliveryProvider
├── InternalDelivery
├── UberDirect
├── ProviderB
└── ProviderC
```

Do not couple order logic to one delivery provider.

---

# 25. Staff Management

Support:

```text
Employees
Departments
Roles
Attendance
Shifts
Leaves
Advances
Salary
Commissions
Employee ledger
```

Attendance should support future integrations with:

```text
Fingerprint
Face recognition
Biometric devices
```

Design device integration as an external adapter.

Do not couple employee management directly to a specific biometric vendor.

---

# 26. Accounting / Finance

Implement a lightweight restaurant-focused financial system.

Support:

```text
Expenses
Income
Cash drawer
Cash movements
Supplier payable
Customer receivable
Ledgers
Payments
Refunds
Profit/Loss
Daily closing
```

Maintain an audit trail.

Financial records should be append-oriented wherever practical.

Avoid silently mutating historical financial records.

---

# 27. Reporting & Analytics

Build dashboards for:

```text
Sales
Orders
Revenue
Profit
Products
Categories
Branches
Employees
Inventory
Purchases
Expenses
Customers
Delivery
Kitchen
Taxes
```

Date filters:

```text
Today
Yesterday
This week
This month
Custom date range
```

Use server-side aggregation.

Never load millions of records into Svelte merely to calculate:

```text
SUM
COUNT
AVG
GROUP BY
```

Use PostgreSQL aggregation.

Return only the data required by the dashboard.

---

# 28. Notifications

Create a notification abstraction supporting:

```text
In-app
Email
SMS
WhatsApp
Push
```

Example:

```ts
type NotificationProvider = {
  send(input: NotificationInput): Promise<Result<void, NotificationError>>;
};
```

Providers should be replaceable.

Use background jobs for expensive notification delivery.

---

# 29. Payments

Create a payment abstraction.

Support:

```text
Cash
Card
Bank transfer
JazzCash
Easypaisa
```

Design the system for future payment providers.

Never store sensitive card information.

Store:

```text
provider
transaction_id
payment_reference
amount
currency
status
metadata
```

Use idempotency for payment operations.

Payment state transitions must be explicit.

---

# 30. Hardware Integration

Design for:

```text
Thermal printers
Kitchen printers
Cash drawers
Barcode scanners
Customer displays
Weighing scales
POS terminals
```

Because browsers cannot reliably access every local hardware device, provide a local device service where required.

Architecture:

```text
SvelteKit
    ↓
Elysia API
    ↓
WebSocket
    ↓
Local Device Service
    ↓
Printer / Drawer / Scanner
```

The local device service should be independently deployable.

---

# 31. Tax / Government Integration

Create an integration layer for Pakistan-specific tax systems.

Potential integrations:

```text
FBR
PRA
```

Do not hard-code provider-specific behavior into the order/payment domain.

Use adapters:

```text
TaxProvider
├── InternalTaxProvider
├── FbrProvider
└── PraProvider
```

Provider failures must not corrupt core transactional data.

Store provider request/response references safely for reconciliation.

---

# 32. Website / Online Ordering

Build an online ordering frontend using SvelteKit.

Support:

```text
Restaurant branding
Menu
Categories
Products
Variants
Modifiers
Cart
Customer address
Delivery
Pickup
Coupons
Payments
Order tracking
```

Restaurants should be able to configure:

```text
Logo
Colors
Fonts
Hero section
Banners
Categories
Featured products
Promotions
Pages
```

Design the website system so future AI-generated layouts can be supported.

Avoid hard-coding a single restaurant website layout.

---

# 33. AI Module

Create an isolated AI module.

Potential features:

```text
AI product descriptions
AI promotional content
AI menu descriptions
AI report querying
AI business assistant
Sales analysis
Inventory analysis
Forecasting
```

AI must never receive unrestricted database access.

Use explicit tools/functions.

Architecture:

```text
User
 ↓
AI
 ↓
Tool Selection
 ↓
Validated Tool
 ↓
Application Function
 ↓
Authorization
 ↓
Database
```

Example tools:

```text
get_sales_summary
get_product_sales
get_low_stock_items
get_customer_summary
get_purchase_summary
get_daily_revenue
```

Mutations must go through normal application authorization and validation.

Never allow:

```text
AI → arbitrary SQL
```

---

# 34. Audit Logs

Record important actions:

```text
Who
What
When
Tenant
Branch
Entity
EntityId
Old value
New value
IP/device where appropriate
```

Examples:

```text
Price changed
Order cancelled
Discount applied
Stock adjusted
Payment refunded
User permissions changed
```

Do not log:

```text
passwords
access tokens
refresh tokens
card information
secrets
```

Audit logs should be append-oriented.

---

# 35. SvelteKit Architecture

Organize the frontend by business feature.

Example:

```text
apps/web/src/
├── routes/
│   ├── (auth)/
│   ├── dashboard/
│   ├── pos/
│   ├── orders/
│   ├── kitchen/
│   ├── tables/
│   ├── products/
│   ├── inventory/
│   ├── purchasing/
│   ├── customers/
│   ├── delivery/
│   ├── staff/
│   ├── accounting/
│   ├── reports/
│   ├── settings/
│   └── administration/
│
├── lib/
│   ├── components/
│   │   ├── ui/
│   │   ├── tables/
│   │   ├── forms/
│   │   ├── charts/
│   │   ├── dialogs/
│   │   └── layouts/
│   │
│   ├── features/
│   │   ├── pos/
│   │   ├── orders/
│   │   ├── inventory/
│   │   ├── products/
│   │   └── ...
│   │
│   ├── api/
│   ├── stores/
│   ├── schemas/
│   ├── utils/
│   └── types/
│
└── hooks.server.ts
```

Feature-specific components should remain close to their feature.

Do not put every component into:

```text
components/
```

---

# 36. SvelteKit Data Loading

Use SvelteKit server-side loading where appropriate.

Prefer:

```text
+page.server.ts
+layout.server.ts
```

for authenticated/server-side data.

Use client-side TanStack Query when:

```text
data is highly interactive
background refetching is useful
pagination is interactive
realtime updates are required
optimistic updates are useful
```

Do not use TanStack Query simply because it exists.

SvelteKit's native server loading is often sufficient.

---

# 37. Frontend State

Use **TanStack Query for Svelte** for:

```text
API data
server state
caching
mutations
pagination
background refetching
```

Use **Svelte 5 runes/stores** for:

```text
POS cart
temporary UI state
sidebar
dialogs
keyboard state
device state
local preferences
```

Do not put all API data into global state.

Do not create one giant:

```text
appStore
```

Prefer feature-local state.

---

# 38. Forms

Use:

```text
Superforms
+
Zod
```

for complex forms.

Use shared Zod schemas where practical.

Example:

```ts
export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  price: z.number().nonnegative(),
  categoryId: z.string().uuid()
});
```

The backend must still validate all input.

Frontend validation exists for UX, not security.

---

# 39. API Client

Do not call APIs randomly from every component.

Create a typed API layer.

Example:

```text
lib/api/
├── auth.ts
├── products.ts
├── orders.ts
├── inventory.ts
├── customers.ts
├── payments.ts
└── reports.ts
```

Expose feature-level functions/hooks.

Example:

```ts
export const getProducts = (...) => ...;

export const createOrder = (...) => ...;
```

Then use them from:

```text
TanStack Query
server load functions
form actions
feature components
```

Use generated OpenAPI types where practical.

---

# 40. Shared Contracts

Where beneficial, create:

```text
packages/contracts
```

containing:

```text
API schemas
DTOs
enums
validation schemas
pagination types
error types
```

Example:

```ts
export const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number(),
});
```

Avoid sharing backend implementation details with the frontend.

Share contracts, not infrastructure.

---

# 41. UI/UX

Use **shadcn-svelte** as the primary UI foundation.

Requirements:

```text
Responsive
Dark mode
Light mode
Keyboard friendly
Fast POS interaction
Accessible
Touch friendly
Mobile friendly
Desktop optimized
```

The POS must prioritize operational speed over decorative UI.

Use:

```text
large touch targets
keyboard navigation
fast search
minimal dialogs
predictable focus management
```

Avoid unnecessary animations inside POS workflows.

---

# 42. POS UX

Design POS around:

```text
Product search
Categories
Cart
Order details
Payment
```

Minimize clicks.

Support:

```text
keyboard
mouse
touch
barcode scanner
```

Product search should support:

```text
name
SKU
barcode
category
aliases
```

Consider local caching for catalog data.

Optimistic UI may be used for purely visual operations, but financial operations must be confirmed by the backend.

---

# 43. Data Tables

Use TanStack Table for complex administrative tables.

Support:

```text
Sorting
Filtering
Column visibility
Pagination
Search
Bulk actions
Row selection
Export
```

Large datasets must use server-side:

```text
pagination
filtering
sorting
search
```

Do not fetch an entire database table into the browser.

---

# 44. Realtime

Use Elysia WebSockets.

Support:

```text
KDS
Order status
POS order updates
Table status
Notifications
Online order updates
```

Example:

```text
POS
 ↓
Elysia
 ↓
WebSocket event
 ↓
KDS
```

Define typed event contracts.

Example:

```ts
type OrderEvent =
  | {
      type: "order.created";
      orderId: string;
    }
  | {
      type: "order.status_changed";
      orderId: string;
      status: OrderStatus;
    };
```

Do not send unrestricted database objects over WebSockets.

---

# 45. Background Jobs

Use a Bun-compatible job/scheduling solution.

Background work includes:

```text
Scheduled reports
Notifications
Low-stock alerts
Daily closing operations
Data synchronization
AI processing
Webhook processing
External integrations
```

Do not block HTTP requests for long-running operations.

For reliable distributed jobs, use Redis-backed queues where appropriate.

Do not introduce a queue for trivial tasks.

---

# 46. Caching

Use caching only where measurement or architecture justifies it.

Good candidates:

```text
restaurant configuration
permissions
product catalog
public menus
tax configuration
frequently accessed reports
```

Do not blindly cache transactional data.

Use Redis when:

```text
multiple API instances exist
distributed state is required
cache invalidation is manageable
```

Avoid Redis for data that PostgreSQL already handles efficiently.

---

# 47. Error Handling

Backend errors must be predictable.

Use structured errors.

Example:

```json
{
	"type": "validation_error",
	"message": "Invalid order",
	"errors": {
		"items": ["Product is unavailable"]
	}
}
```

Frontend should display meaningful errors through:

```text
Sonner
dialogs
form validation
inline field errors
```

Never silently swallow errors.

Unexpected exceptions should be logged and converted to safe responses.

Do not expose stack traces in production.

---

# 48. Logging & Observability

Use structured logging.

Include:

```text
RequestId
TenantId
BranchId
UserId
Operation
Duration
Result
```

Never log:

```text
Passwords
Access tokens
Refresh tokens
Card information
Secrets
```

Structure the application so OpenTelemetry can be introduced later.

Consider tracing:

```text
HTTP request
→ service operation
→ database query
→ external provider
```

for critical workflows.

---

# 49. Security

Implement:

```text
JWT security
Refresh token rotation
Password hashing with Argon2id
Rate limiting
CORS
CSRF protection where applicable
Input validation
Authorization
Tenant isolation
Audit logs
Secure headers
```

Never trust client-provided:

```text
tenantId
branchId
userId
price
discount
permissions
role
payment status
inventory quantity
```

Resolve sensitive context server-side.

All financial calculations must be server-authoritative.

---

# 50. Authentication Storage

For browser authentication, prefer secure cookies where appropriate.

Use:

```text
HttpOnly
Secure
SameSite
```

attributes correctly.

Never expose refresh tokens to ordinary client-side JavaScript unnecessarily.

Do not store sensitive authentication tokens in:

```text
localStorage
```

without a specific, documented reason.

---

# 51. Performance

Prioritize:

```text
Fast POS startup
Fast product search
Fast order creation
Fast payment completion
Fast inventory operations
Efficient dashboards
```

Use:

```text
database indexes
projection queries
prepared queries where useful
pagination
server-side aggregation
query caching where justified
AsNoTracking equivalent through efficient Drizzle queries
```

Do not prematurely optimize everything.

Measure first.

---

# 52. Database Indexing

Create indexes around real query patterns.

Typical candidates:

```text
tenant_id
branch_id
created_at
status
sku
barcode
customer_id
order_id
product_id
```

Use composite indexes where queries commonly combine fields.

Example:

```text
tenant_id + branch_id + created_at
```

Do not blindly index every column.

---

# 53. Money

Never use floating-point arithmetic for financial values.

Use PostgreSQL:

```text
numeric
```

and TypeScript representations that preserve monetary precision.

Define a consistent money strategy.

Do not allow:

```ts
0.1 + 0.2
```

style floating-point calculations to determine financial totals.

Calculate authoritative totals server-side.

---

# 54. Time & Dates

Store timestamps consistently.

Prefer:

```text
UTC in backend/database
```

Convert to restaurant/local timezone for presentation and business rules where required.

Restaurant configuration should include:

```text
timezone
currency
locale
```

Business-day reports must use the restaurant's configured timezone.

---

# 55. Internationalization

Design the system so it can eventually support:

```text
English
Urdu
Arabic
```

Do not hard-code user-visible strings throughout business logic.

Restaurant configuration should support:

```text
currency
timezone
locale
tax configuration
```

---

# 56. File Storage

Product images, restaurant logos, receipts and other files should not be stored directly in PostgreSQL unless there is a specific reason.

Create a storage abstraction:

```text
StorageProvider
├── LocalStorage
├── S3Storage
└── OtherProvider
```

Store:

```text
file ID
storage key
mime type
size
metadata
```

in PostgreSQL.

---

# 57. Website Customization

Support tenant-specific branding:

```text
logo
colors
fonts
favicon
banners
hero sections
menu layout
featured products
promotions
pages
```

Represent configurable website content using structured schemas.

Avoid allowing arbitrary executable JavaScript.

Future AI-generated layouts should produce validated structured layout data.

Example conceptual model:

```text
Page
 ├── sections
 │    ├── Hero
 │    ├── Categories
 │    ├── Products
 │    ├── Banner
 │    └── Promotion
```

---

# 58. AI-Generated Website Layouts

Future AI output should be treated as data, not executable code.

Example:

```json
{
	"type": "hero",
	"variant": "split",
	"title": "Fresh Burgers",
	"image": "...",
	"theme": "dark"
}
```

Validate generated layouts before saving.

Do not allow AI to directly generate:

```text
arbitrary HTML
arbitrary JavaScript
database queries
server-side code
```

without controlled validation/sandboxing.

---

# 59. Tax / Pricing Calculations

Keep pricing calculations centralized.

Example conceptual flow:

```text
Product Price
 ↓
Modifiers
 ↓
Discount
 ↓
Tax
 ↓
Tip
 ↓
Delivery
 ↓
Grand Total
```

Do not implement pricing independently in:

```text
POS
Website
Mobile
AI
```

Use one authoritative backend pricing engine.

---

# 60. Order Domain

The order domain should coordinate relevant modules.

Example:

```text
POS
 ↓
Order
 ↓
Payment
 ↓
Inventory
 ↓
Accounting
 ↓
Analytics
```

However, do not tightly couple every module into one giant function.

Use explicit domain/application events where useful.

Example:

```text
OrderCompleted
PaymentCaptured
InventoryDeducted
RefundCreated
```

Events should represent meaningful business facts.

---

# 61. Event Architecture

Use events only where they improve decoupling.

Example:

```ts
type DomainEvent =
  | OrderCompletedEvent
  | PaymentCapturedEvent
  | InventoryAdjustedEvent
  | RefundCreatedEvent;
```

Events may trigger:

```text
notifications
analytics updates
inventory processing
accounting entries
KDS updates
```

Do not turn the entire application into an event-driven system unnecessarily.

Prefer synchronous transactions for operations requiring immediate consistency.

---

# 62. Webhooks

External provider webhooks must support:

```text
signature verification
idempotency
retries
logging
safe processing
```

Never trust webhook payloads without provider verification.

Store webhook processing state where necessary.

---

# 63. Testing

Backend:

```text
Unit tests
Integration tests
API tests
Database tests
```

Frontend:

```text
Component tests
Store/state tests
Form tests
E2E tests
```

Recommended:

```text
Vitest
Testing Library
Playwright
Testcontainers
```

Use Bun-compatible tooling where practical.

Critical workflows:

```text
Create order
Pay order
Refund order
Inventory deduction
Purchase receiving
Recipe costing
Discount application
Tenant isolation
Authorization
Payment idempotency
Order state transitions
```

---

# 64. Testcontainers

Integration tests should run against real PostgreSQL where practical.

Avoid testing PostgreSQL-specific behavior exclusively against mocks.

Important tests:

```text
tenant isolation
transactions
constraints
concurrency
inventory
financial calculations
```

Use isolated databases/containers for tests.

---

# 65. E2E Testing

Use Playwright for critical user workflows.

Examples:

```text
Login
Create product
Open POS
Add products
Apply discount
Complete payment
View receipt
Open KDS
Complete kitchen order
View inventory
```

Test both desktop and relevant mobile/touch layouts where appropriate.

---

# 66. Docker / Local Development

Provide:

```text
docker-compose.yml
```

for:

```text
PostgreSQL
Redis
```

The applications should remain runnable directly during development.

Example:

```text
bun install

bun run dev
```

Provide:

```text
.env.example
```

with required variables.

Never commit secrets.

---

# 67. Environment Variables

Use typed environment configuration.

Example:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
REFRESH_TOKEN_SECRET
PUBLIC_API_URL
API_URL
STORAGE_BUCKET
STORAGE_REGION
EMAIL_PROVIDER_KEY
PAYMENT_PROVIDER_KEY
```

Separate:

```text
server-only variables
public variables
```

SvelteKit public variables must never contain secrets.

---

# 68. Development Commands

The monorepo should provide simple commands.

Example:

```bash
bun install

bun run dev
bun run dev:web
bun run dev:api

bun run build
bun run test
bun run test:e2e
bun run lint
bun run typecheck
bun run db:migrate
bun run db:seed
```

Commands should be documented.

---

# 69. Code Quality

Prefer simple code over excessive architecture.

Do not create abstractions without a reason.

Avoid:

```text
GenericRepository<T>
GenericService<T>
BaseController
BaseService
BaseEntity
```

Do not recreate enterprise Java/.NET architecture unnecessarily.

Avoid:

```text
massive route files
massive services
god stores
god components
god modules
```

Keep features cohesive.

---

# 70. Type Safety

TypeScript strict mode must be enabled.

Prefer:

```json
{
	"compilerOptions": {
		"strict": true
	}
}
```

Avoid:

```ts
any
```

unless there is a documented technical reason.

Prefer:

```ts
unknown
```

with proper narrowing.

Use discriminated unions for state machines.

Example:

```ts
type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded";
```

---

# 71. API Type Safety

The API schemas should be the source of truth.

Prefer:

```text
Zod/Elysia schema
        ↓
OpenAPI
        ↓
typed frontend client
```

Avoid maintaining duplicate manually-written request/response interfaces wherever possible.

---

# 72. Validation

Validate at multiple boundaries.

Frontend:

```text
Zod
Superforms
```

Backend:

```text
Elysia schema validation
domain validation
database constraints
```

Never assume frontend validation is sufficient.

---

# 73. Authorization Model

Support:

```text
Platform Admin
Tenant Owner
Tenant Admin
Branch Manager
Cashier
Kitchen Staff
Inventory Manager
Accountant
Delivery Manager
Staff Manager
Custom Roles
```

Permissions should be granular.

Example:

```text
orders.read
orders.create
orders.update
orders.cancel
orders.refund

inventory.read
inventory.adjust
inventory.transfer

products.read
products.create
products.update
products.delete

reports.read
```

Support custom roles.

---

# 74. Branch Isolation

Users may have access to:

```text
all branches
specific branches
```

Authorization must verify branch access.

A user from:

```text
Branch A
```

must not be able to manipulate:

```text
Branch B
```

unless explicitly authorized.

---

# 75. Auditability

Critical business operations should produce auditable records.

Examples:

```text
order created
order modified
order cancelled
payment captured
payment refunded
price changed
inventory adjusted
purchase received
user permission changed
```

Where practical, include:

```text
request ID
user ID
tenant ID
branch ID
timestamp
```

---

# 76. Reporting Architecture

Reports should not directly expose raw database structure.

Create report queries/projections.

Example:

```text
SalesReport
InventoryValuationReport
ProductPerformanceReport
DailyClosingReport
TaxReport
EmployeeSalesReport
```

Reports should use optimized SQL.

Consider database views/materialized views for expensive analytics only after measuring query performance.

---

# 77. Search

Product search is performance-critical.

Support:

```text
name
SKU
barcode
aliases
category
```

Start with PostgreSQL indexes/search capabilities.

Do not introduce Elasticsearch/OpenSearch unless actual scale or requirements justify it.

---

# 78. Pagination

Use cursor pagination where appropriate for large/high-volume datasets.

Use offset pagination where:

```text
dataset is moderate
administrative UX benefits from page numbers
```

Do not force cursor pagination everywhere.

---

# 79. Soft Deletion

Use soft deletion only for entities where historical references matter.

Examples:

```text
products
customers
employees
suppliers
```

Do not soft-delete transactional records such as:

```text
payments
stock movements
audit logs
financial ledger entries
```

Historical records must remain auditable.

---

# 80. Data Integrity

Use PostgreSQL constraints for invariants that should never be violated.

Examples:

```text
unique SKU per tenant
unique barcode where appropriate
positive quantities
valid foreign keys
unique payment reference
```

Do not rely exclusively on TypeScript validation for database integrity.

---

# 81. Security Boundaries

Clearly separate:

```text
Public API
Authenticated API
Tenant API
Platform Admin API
Internal service operations
```

Do not expose internal administrative operations through public endpoints.

---

# 82. Rate Limiting

Apply rate limits to:

```text
login
OTP
password reset
public ordering
payment endpoints
webhooks
AI endpoints
```

Do not use the same rate limit for every endpoint.

---

# 83. Public Online Ordering

Public restaurant websites must not expose private tenant data.

Public APIs should return only explicitly public information.

For example:

```text
public menu
public restaurant information
public promotions
```

must be separated from:

```text
inventory
supplier data
employee information
accounting
private customers
```

---

# 84. Offline / Poor Connectivity Considerations

The system should consider restaurants operating with unreliable internet.

POS architecture should allow future offline capabilities.

Potential approach:

```text
SvelteKit/PWA
 ↓
IndexedDB/local persistence
 ↓
Offline order queue
 ↓
Sync engine
 ↓
Elysia API
```

Do not implement a complicated offline system in Phase 1 unless required, but keep the architecture compatible with it.

Financial synchronization must be carefully designed around idempotency and conflict resolution.

---

# 85. PWA

The POS should be capable of becoming a PWA.

Potential features:

```text
installable POS
offline shell
cached catalog
local printer communication
offline queue
reconnection
```

Do not cache sensitive information unnecessarily.

---

# 86. Deployment

The application should be deployable as:

```text
SvelteKit web application
Elysia API
PostgreSQL
Redis
```

Support:

```text
Docker
Linux
reverse proxy
HTTPS
environment-based configuration
```

Do not tightly couple deployment to a single cloud provider.

---

# 87. Production Architecture

Example:

```text
                    ┌───────────────┐
                    │   SvelteKit   │
                    │     Web       │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   ElysiaJS    │
                    │      API      │
                    └───────┬───────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        PostgreSQL        Redis       External APIs
                                      ├─ Payments
                                      ├─ FBR/PRA
                                      ├─ WhatsApp
                                      ├─ SMS
                                      └─ Delivery
```

Realtime:

```text
SvelteKit
    ↕
Elysia WebSocket
    ↕
POS / KDS / Tables / Notifications
```

---

# 88. Local Device Architecture

For local hardware:

```text
Restaurant PC
│
├── Browser
│     └── SvelteKit POS
│
└── ROMS Device Service
      ├── Thermal Printer
      ├── Kitchen Printer
      ├── Cash Drawer
      ├── Barcode Scanner
      └── Other Devices
```

Communication:

```text
SvelteKit
    ↓
WebSocket / local HTTP
    ↓
Device Service
```

The device service must not expose unrestricted local-system operations to the browser.

Authenticate/authorize local device connections.

---

# 89. Feature Development Rules

Each feature should follow:

```text
Schema
↓
Database
↓
Backend business logic
↓
API
↓
Frontend API client
↓
UI
↓
Tests
```

Keep each feature runnable before moving to the next.

Do not build the entire database first and postpone business logic.

---

# 90. Development Phases

## Phase 1 — Foundation

Implement:

```text
Monorepo
Bun workspace
SvelteKit
ElysiaJS
PostgreSQL
Drizzle
Docker
Shared contracts
Logging
Configuration
OpenAPI
Scalar
Testing infrastructure
```

---

## Phase 2 — Authentication & Tenancy

Implement:

```text
Authentication
Tenants
Branches
Users
Roles
Permissions
Sessions
Refresh tokens
Audit logs
```

---

## Phase 3 — Catalog & POS

Implement:

```text
Products
Categories
Variants
Modifiers
Pricing
POS
Orders
Payments
Receipts
```

---

## Phase 4 — Inventory & Purchasing

Implement:

```text
Inventory
Stock movements
Warehouses
Stock transfers
Suppliers
Purchase orders
Receiving
Supplier payments
```

---

## Phase 5 — Restaurant Operations

Implement:

```text
Recipes
Production
Kitchen
KDS
Tables
Floor plans
Reservations
```

---

## Phase 6 — CRM & Delivery

Implement:

```text
Customers
Loyalty
Customer ledger
Delivery
Riders
Delivery zones
```

---

## Phase 7 — Workforce & Accounting

Implement:

```text
Staff
Attendance
Shifts
Leaves
Advances
Commissions
Expenses
Cash management
Accounting
Daily closing
```

---

## Phase 8 — Reporting

Implement:

```text
Sales dashboards
Inventory reports
Purchase reports
Product reports
Customer reports
Employee reports
Financial reports
Tax reports
Kitchen reports
```

---

## Phase 9 — Online Ordering

Implement:

```text
Restaurant website
Menu
Cart
Checkout
Delivery
Pickup
Coupons
Online payments
Order tracking
Restaurant branding
Website customization
```

---

## Phase 10 — Integrations

Implement:

```text
WhatsApp
SMS
Email
Push notifications
Payment providers
FBR
PRA
Delivery providers
Hardware
Local device service
```

---

## Phase 11 — AI

Implement:

```text
AI product descriptions
AI marketing content
AI report querying
AI sales analysis
AI inventory analysis
AI business assistant
Forecasting
```

AI must remain isolated behind explicit application tools.

---

# 91. Important Engineering Principle

The system should behave as one coherent platform.

For example:

```text
POS
 ↓
Order
 ↓
Payment
 ↓
Inventory
 ↓
Accounting
 ↓
Analytics
```

However, each module must remain independently understandable.

Do not duplicate business logic between:

```text
POS
Website
Mobile
Admin
API
AI
```

The backend is the source of truth.

---

# 92. Important Architectural Rule

Do not blindly recreate .NET architecture in TypeScript.

Do NOT create:

```text
Controllers
Services
Repositories
Managers
Handlers
Factories
Interfaces
```

for every single operation simply because enterprise applications commonly use them.

Instead prefer:

```text
Elysia route
    ↓
validated input
    ↓
feature function
    ↓
database / domain operation
```

For complex features:

```text
Elysia route
    ↓
application function
    ↓
domain functions
    ↓
repository/query functions
    ↓
database
```

Use the simplest structure that keeps the feature maintainable.

---

# 93. Functional Programming Preference

Prefer:

```text
pure functions
immutable data
composition
small functions
explicit dependencies
discriminated unions
```

Example:

```ts
const calculateOrderTotals = (
  input: OrderPricingInput
): OrderTotals => {
  const subtotal = calculateSubtotal(input.items);
  const discount = calculateDiscount(input);
  const tax = calculateTax({
    subtotal,
    discount,
    taxRules: input.taxRules
  });

  return {
    subtotal,
    discount,
    tax,
    total: subtotal - discount + tax
  };
};
```

Keep pure calculations separate from:

```text
database
HTTP
filesystem
external APIs
```

where practical.

This makes critical business logic easy to test.

---

# 94. Dependency Rules

Every dependency must have a clear purpose.

Before installing a package:

1. Verify the latest stable version.
2. Check official documentation.
3. Confirm Bun compatibility.
4. Confirm SvelteKit compatibility.
5. Confirm maintenance/activity.
6. Determine whether the platform already provides the functionality.

Do not install libraries merely because they are popular.

Prefer native:

```text
Bun
Web APIs
SvelteKit
Elysia
PostgreSQL
```

capabilities when sufficient.

---

# 95. Version Policy

Every dependency must use its **latest stable version at the time of project creation**.

Do not blindly use versions from this prompt.

Before installing packages, verify current stable versions from official documentation/package registries.

Version-sensitive APIs must be implemented according to the currently installed versions.

---

# 96. Documentation

Provide:

```text
README.md
ARCHITECTURE.md
DEVELOPMENT.md
DATABASE.md
API.md
SECURITY.md
DEPLOYMENT.md
```

Document:

```text
architecture
local setup
environment variables
database setup
migrations
seed data
testing
deployment
authentication
tenant isolation
realtime architecture
hardware integration
AI architecture
```

---

# 97. Seed Data

Provide development seed data for:

```text
Tenant
Branches
Users
Roles
Permissions
Categories
Products
Modifiers
Tables
Suppliers
Customers
Inventory
Recipes
```

Create realistic restaurant data.

Do not use production credentials.

---

# 98. Development Experience

The project should start with minimal commands.

Expected flow:

```bash
git clone ...
cd roms

bun install

cp .env.example .env

docker compose up -d

bun run db:migrate
bun run db:seed

bun run dev
```

The application should then provide:

```text
SvelteKit web
Elysia API
Scalar API documentation
PostgreSQL
Redis
```

where configured.

---

# 99. Deliverables

Generate:

```text
Complete Bun workspace
Complete SvelteKit application
Complete ElysiaJS API
PostgreSQL schema
Drizzle schema
Drizzle migrations
Seed scripts
Authentication
Authorization
Tenant isolation
Role/permission system
Validation
API endpoints
OpenAPI
Scalar
Frontend pages
shadcn-svelte components
TanStack Query integration
Svelte state management
Forms
Dashboards
POS interface
KDS
Inventory
Purchasing
Recipes
Tables
Customers
Delivery
Staff
Accounting
Reports
Docker configuration
Environment configuration
Tests
Playwright E2E tests
README
Architecture documentation
```

---

# 100. Final Development Rule

Build incrementally.

Start with:

```text
Architecture
↓
Bun workspace
↓
SvelteKit
↓
ElysiaJS
↓
PostgreSQL
↓
Drizzle
↓
Shared contracts
↓
Authentication
↓
Tenancy
↓
Catalog
↓
POS
```

After every major step:

```text
Typecheck
↓
Lint
↓
Test
↓
Run application
↓
Verify API
↓
Verify UI
```

Keep the application runnable after every major feature.

Do not generate thousands of files before validating the architecture.

Do not create placeholder abstractions for future features.

Implement real functionality in small vertical slices.

The goal is a production-grade system, not a giant generated scaffold.

The final architecture should remain understandable to a developer opening the repository for the first time.

## Core principle

```text
Simple
+
Typed
+
Transactional
+
Tenant-safe
+
Fast
+
Observable
+
Testable
+
Incrementally built
```

is more important than architectural complexity.
