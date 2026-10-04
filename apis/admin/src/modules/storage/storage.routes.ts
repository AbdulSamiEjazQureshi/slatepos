import { Elysia } from 'elysia';
import { z } from 'zod';
import type { AppDeps } from '../../app/deps';
import { requireTenantId } from '../../lib/context';
import { authPlugin } from '../../plugins/auth';
import { deleteFile, getFileContent, listFiles, uploadFile } from './storage.service';

export const storageModule = (deps: AppDeps) =>
  new Elysia({ prefix: '/api/v1/files', tags: ['integrations'] })
    .use(authPlugin(deps))
    .get('/', async ({ ctx }) => listFiles(deps, requireTenantId(ctx)), {
      requireTenant: true,
      requirePermission: 'settings.read'
    })
    .post(
      '/',
      async ({ ctx, body }) =>
        uploadFile(deps, requireTenantId(ctx), {
          filename: body.filename,
          mimeType: body.mimeType,
          dataBase64: body.dataBase64,
          userId: ctx.userId
        }),
      {
        requireTenant: true,
        requirePermission: 'settings.manage',
        body: z.object({
          filename: z.string().trim().min(1).max(255),
          mimeType: z.string().trim().min(1).max(120),
          dataBase64: z.string().min(1)
        }),
        detail: { summary: 'Upload a file to the configured storage provider' }
      }
    )
    .get(
      '/:id/content',
      async ({ ctx, params }) => {
        const { meta, data } = await getFileContent(deps, requireTenantId(ctx), params.id);
        return new Response(data, { headers: { 'content-type': meta.mimeType } });
      },
      { requireTenant: true, requirePermission: 'settings.read' }
    )
    .get(
      '/:id',
      async ({ ctx, params }) =>
        getFileContent(deps, requireTenantId(ctx), params.id).then((r) => r.meta),
      {
        requireTenant: true,
        requirePermission: 'settings.read'
      }
    )
    .delete('/:id', async ({ ctx, params }) => deleteFile(deps, requireTenantId(ctx), params.id), {
      requireTenant: true,
      requirePermission: 'settings.manage'
    });
