import { Elysia } from 'elysia';
import { openapi } from '@elysia/openapi';
import { staticPlugin } from '@elysia/static';
import { join } from 'node:path';

/**
 * OpenAPI spec + Scalar UI, generated from the Elysia route schemas. The Scalar
 * standalone bundle is self-hosted under /scalar so the docs render without any
 * external CDN.
 */
export const openapiPlugin = () =>
  new Elysia({ name: 'openapi' })
    .use(
      staticPlugin({
        assets: join(import.meta.dir, '../../public'),
        prefix: ''
      })
    )
    .use(
      openapi({
        path: '/api/openapi',
        scalar: { cdn: '/scalar/scalar-standalone.min.js' },
        documentation: {
          info: {
            title: 'ROMS API',
            version: '1.0.0',
            description:
              'Restaurant Operating Management System API. Multi-tenant, typed, and generated from route schemas.'
          },
          tags: [
            { name: 'health', description: 'Liveness and readiness' },
            { name: 'auth', description: 'Authentication, sessions and tokens' },
            { name: 'tenants', description: 'Tenants and branches' },
            { name: 'users', description: 'Users, roles and permissions' },
            {
              name: 'catalog',
              description: 'Categories, products, variants and modifiers'
            },
            { name: 'orders', description: 'Orders and order lifecycle' },
            {
              name: 'payments',
              description: 'Payments, refunds and cash movements'
            },
            { name: 'inventory', description: 'Stock levels and movements' },
            { name: 'tables', description: 'Floors, tables and reservations' },
            { name: 'customers', description: 'Customers and CRM' },
            { name: 'realtime', description: 'WebSocket subscriptions' }
          ]
        },
        exclude: {
          paths: ['/api/ws']
        }
      })
    );
