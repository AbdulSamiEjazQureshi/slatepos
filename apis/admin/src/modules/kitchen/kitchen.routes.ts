import { Elysia } from 'elysia';
import { z } from 'zod';
import { uuidSchema } from '@roms/contracts/common';
import { kitchenTicketStatusSchema } from '@roms/contracts/enums';
import { RealtimeTopic } from '@roms/contracts/events';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import {
  createStation,
  listStations,
  listTickets,
  setTicketPriority,
  setTicketStatus
} from './kitchen.service';

export const kitchenModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/kitchen', tags: ['kitchen'] })
    .use(authPlugin(deps))
    .get(
      '/stations',
      async ({ ctx, query }) => listStations(deps, requireTenantId(ctx), query.branchId),
      {
        requireTenant: true,
        requirePermission: 'kitchen.read',
        query: z.object({ branchId: uuidSchema.optional() })
      }
    )
    .post(
      '/stations',
      async ({ ctx, body }) => createStation(deps, requireTenantId(ctx), body.branchId, body.name),
      {
        requireTenant: true,
        requirePermission: 'kitchen.manage',
        body: z.object({ branchId: uuidSchema, name: z.string().trim().min(1).max(80) })
      }
    )
    .get(
      '/tickets',
      async ({ ctx, query }) =>
        listTickets(deps, requireTenantId(ctx), { branchId: query.branchId, status: query.status }),
      {
        requireTenant: true,
        requirePermission: 'kitchen.read',
        query: z.object({
          branchId: uuidSchema.optional(),
          status: kitchenTicketStatusSchema.optional()
        })
      }
    )
    .post(
      '/tickets/:id/status',
      async ({ ctx, params, body }) => {
        const ticket = await setTicketStatus(deps, requireTenantId(ctx), params.id, body.status);
        deps.realtime.publish(RealtimeTopic.branchKitchen(ticket.branchId), {
          type: 'kitchen.ticket_status_changed',
          ticketId: ticket.id,
          orderId: ticket.orderId,
          branchId: ticket.branchId,
          status: ticket.status
        });
        return ticket;
      },
      {
        requireTenant: true,
        requirePermission: 'kitchen.manage',
        body: z.object({ status: kitchenTicketStatusSchema })
      }
    )
    .post(
      '/tickets/:id/priority',
      async ({ ctx, params, body }) =>
        setTicketPriority(deps, requireTenantId(ctx), params.id, body.priority),
      {
        requireTenant: true,
        requirePermission: 'kitchen.manage',
        body: z.object({ priority: z.number().int().min(0).max(10) })
      }
    );
