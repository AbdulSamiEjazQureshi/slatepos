import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { and, desc, eq } from '@roms/database';
import { files } from '@roms/database';
import { AppError } from '@roms/utils';
import type { AppDeps } from '../../app/deps';

/** Storage abstraction: bytes live outside PostgreSQL; only metadata is stored. */
export type StorageProvider = {
  readonly name: string;
  put: (key: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
  get: (key: string) => Promise<Uint8Array<ArrayBuffer> | null>;
  delete: (key: string) => Promise<void>;
};

const createLocalStorage = (dir: string): StorageProvider => {
  const root = resolve(dir);
  const pathFor = (key: string): string => join(root, key.replace(/\.\./g, ''));
  return {
    name: 'local',
    async put(key, data) {
      const target = pathFor(key);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, data);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathFor(key)));
      } catch {
        return null;
      }
    },
    async delete(key) {
      try {
        await unlink(pathFor(key));
      } catch {
        // Already gone.
      }
    }
  };
};

export const createStorage = (deps: AppDeps): StorageProvider => {
  if (deps.config.storage.provider === 's3') {
    // S3 adapter would be registered here; local remains the fallback.
    return createLocalStorage(deps.config.storage.localDir);
  }
  return createLocalStorage(deps.config.storage.localDir);
};

const sanitize = (name: string): string => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);

export const uploadFile = async (
  deps: AppDeps,
  tenantId: string,
  input: { filename: string; mimeType: string; dataBase64: string; userId?: string | null }
) => {
  const provider = createStorage(deps);
  const bytes = Buffer.from(input.dataBase64, 'base64');
  const key = `${tenantId}/${crypto.randomUUID()}-${sanitize(input.filename)}`;
  await provider.put(key, new Uint8Array(bytes));

  const inserted = await deps.db
    .insert(files)
    .values({
      tenantId,
      storageKey: key,
      provider: provider.name,
      mimeType: input.mimeType,
      size: bytes.length,
      originalName: input.filename,
      createdBy: input.userId ?? null
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Failed to store file');
  return row;
};

export const listFiles = async (deps: AppDeps, tenantId: string) =>
  deps.db
    .select()
    .from(files)
    .where(eq(files.tenantId, tenantId))
    .orderBy(desc(files.createdAt))
    .limit(200);

export const getFileMeta = async (deps: AppDeps, tenantId: string, id: string) => {
  const rows = await deps.db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.tenantId, tenantId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw AppError.notFound('File not found');
  return row;
};

export const getFileContent = async (deps: AppDeps, tenantId: string, id: string) => {
  const meta = await getFileMeta(deps, tenantId, id);
  const provider = createStorage(deps);
  const data = await provider.get(meta.storageKey);
  if (!data) throw AppError.notFound('File content missing');
  return { meta, data };
};

export const deleteFile = async (deps: AppDeps, tenantId: string, id: string) => {
  const meta = await getFileMeta(deps, tenantId, id);
  await createStorage(deps).delete(meta.storageKey);
  await deps.db.delete(files).where(eq(files.id, id));
  return { ok: true as const };
};
