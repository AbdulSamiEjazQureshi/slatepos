import { Elysia } from 'elysia';
import type { AppDeps } from './deps';
import { accountingModule } from '../modules/accounting/accounting.routes';
import { aiModule } from '../modules/ai/ai.routes';
import { auditModule } from '../modules/audit/audit.routes';
import { authModule } from '../modules/auth/auth.routes';
import { branchesModule } from '../modules/branches/branches.routes';
import { categoriesModule } from '../modules/catalog/categories.routes';
import { productsModule } from '../modules/catalog/products.routes';
import { customersModule } from '../modules/customers/customers.routes';
import { deliveryModule } from '../modules/delivery/delivery.routes';
import { healthModule } from '../modules/health';
import { integrationsModule } from '../modules/integrations/integrations.routes';
import { inventoryModule } from '../modules/inventory/inventory.routes';
import { kitchenModule } from '../modules/kitchen/kitchen.routes';
import { ordersModule } from '../modules/orders/orders.routes';
import { paymentsModule } from '../modules/payments/payments.routes';
import { promotionsModule } from '../modules/promotions/promotions.routes';
import { purchasingModule } from '../modules/purchasing/purchasing.routes';
import { realtimeModule } from '../modules/realtime/realtime.routes';
import { recipesModule } from '../modules/recipes/recipes.routes';
import { reportsExtraModule } from '../modules/reports/reports.extra.routes';
import { reportsModule } from '../modules/reports/reports.routes';
import { storageModule } from '../modules/storage/storage.routes';
import { tableOpsModule } from '../modules/tables/tables.ops.routes';
import { tablesModule } from '../modules/tables/tables.routes';
import { tenantsModule } from '../modules/tenants/tenants.routes';
import { rolesModule, usersModule } from '../modules/users/users.routes';
import { publicModule, websiteModule } from '../modules/website/website.routes';
import { workforceModule } from '../modules/workforce/workforce.routes';
import { errorHandlerPlugin } from '../plugins/error-handler';
import { openapiPlugin } from '../plugins/openapi';
import { securityPlugin } from '../plugins/security';

/**
 * Modules added on top of the initial cut (promotions, floor operations, extra
 * analytics and storage) are composed into a single sub-app and mounted once.
 * This keeps the main composition within TypeScript's instantiation depth limit
 * while their routes remain served at runtime.
 */
const supplementaryModules = (deps: AppDeps) =>
  new Elysia({ name: 'supplementary' })
    .use(promotionsModule(deps))
    .use(tableOpsModule(deps))
    .use(reportsExtraModule(deps))
    .use(storageModule(deps));

/**
 * Compose the application from plugins and feature modules. Feature modules
 * expose their routes through Elysia plugins and declare their own
 * authentication/authorization requirements.
 */
export const createApp = (deps: AppDeps) =>
  new Elysia({ name: 'roms-api' })
    .use(errorHandlerPlugin(deps))
    .use(securityPlugin(deps))
    .use(openapiPlugin())
    .use(healthModule(deps))
    .use(authModule(deps))
    .use(tenantsModule(deps))
    .use(branchesModule(deps))
    .use(usersModule(deps))
    .use(rolesModule(deps))
    .use(auditModule(deps))
    .use(categoriesModule(deps))
    .use(productsModule(deps))
    .use(ordersModule(deps))
    .use(paymentsModule(deps))
    .use(inventoryModule(deps))
    .use(tablesModule(deps))
    .use(customersModule(deps))
    .use(reportsModule(deps))
    .use(purchasingModule(deps))
    .use(recipesModule(deps))
    .use(kitchenModule(deps))
    .use(deliveryModule(deps))
    .use(workforceModule(deps))
    .use(accountingModule(deps))
    .use(websiteModule(deps))
    .use(integrationsModule(deps))
    .use(aiModule(deps))
    .use(publicModule(deps))
    .use(supplementaryModules(deps))
    .use(realtimeModule(deps));

/**
 * The fully-typed application, consumed by the frontend through Eden Treaty.
 * Importing this type does not start the server.
 */
export type App = ReturnType<typeof createApp>;
