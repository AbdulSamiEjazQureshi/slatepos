/**
 * Cache abstraction. The default adapter is in-process; a Redis adapter can be
 * added behind this interface when multiple API instances need shared state.
 */
export type Cache = {
  get: <T>(key: string) => Promise<T | null>;
  set: <T>(key: string, value: T, ttlSeconds: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  /** Delete every key matching a prefix (used for scoped invalidation). */
  invalidatePrefix: (prefix: string) => Promise<void>;
};

type Entry = { value: unknown; expiresAt: number };

export const createMemoryCache = (): Cache => {
  const store = new Map<string, Entry>();

  const isExpired = (entry: Entry): boolean => entry.expiresAt <= Date.now();

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async invalidatePrefix(prefix: string): Promise<void> {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    }
  };
};
