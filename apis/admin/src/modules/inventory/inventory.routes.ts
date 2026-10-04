import { Elysia } from 'elysia';
import { z } from 'zod';
import {
  listMovementsQuerySchema,
  listStockQuerySchema,
  stockAdjustmentResultSchema,
  stockAdjustmentSchema,
  stockMovementDtoSchema,
  stockRowSchema,
  stockTransferResultSchema,
  stockTransferSchema
} from '@roms/contracts/inventory';
import { paginatedSchema } from '@roms/contracts/common';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { recordAudit } from '../../lib/audit';
import { authPlugin } from '../../plugins/auth';
import { adjustStock, listMovements, listStock, transferStock } from './inventory.service';

const listStockSchema = listStockQuerySchema.extend({ branchId: z.string().uuid().optional() });

export const inventoryModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/inventory', tags: ['inventory'] })
    .use(authPlugin(deps))
    .get('/stock', async ({ ctx, query }) => listStock(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'inventory.read',
      query: listStockSchema,
      response: { 200: paginatedSchema(stockRowSchema) },
      detail: { summary: 'List stock levels (optionally low-stock only)' }
    })
    .get('/movements', async ({ ctx, query }) => listMovements(deps, requireTenantId(ctx), query), {
      requireTenant: true,
      requirePermission: 'inventory.read',
      query: listMovementsQuerySchema.extend({ branchId: z.string().uuid().optional() }),
      response: { 200: paginatedSchema(stockMovementDtoSchema) },
      detail: { summary: 'List the append-only stock movement ledger' }
    })
    .post(
      '/adjust',
      async ({ ctx, body }) => {
        const result = await adjustStock(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'inventory.adjusted',
          entity: 'stock_level',
          entityId: result.productId,
          newValues: { delta: body.quantityDelta, balance: result.balance, reason: body.reason }
        });
        return result;
      },
      {
        requireTenant: true,
        requirePermission: 'inventory.adjust',
        body: stockAdjustmentSchema,
        response: { 200: stockAdjustmentResultSchema },
        detail: { summary: 'Adjust stock (always records a movement)' }
      }
    )
    .post(
      '/transfer',
      async ({ ctx, body }) => {
        const result = await transferStock(deps, ctx, body);
        await recordAudit(deps.db, ctx, {
          action: 'inventory.transferred',
          entity: 'stock_transfer',
          entityId: body.fromBranchId,
          newValues: { from: body.fromBranchId, to: body.toBranchId, items: body.items.length }
        });
        return result;
      },
      {
        requireTenant: true,
        requirePermission: 'inventory.transfer',
        body: stockTransferSchema,
        response: { 200: stockTransferResultSchema },
        detail: { summary: 'Transfer stock between branches transactionally' }
      }
    );
