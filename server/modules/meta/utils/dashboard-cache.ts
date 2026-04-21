type CacheRecord<T> = {
  expiresAt: number;
  value: T;
};

const dashboardCache = new Map<string, CacheRecord<unknown>>();
const inflightDashboardCache = new Map<string, Promise<unknown>>();

const MAX_CACHE_ENTRIES = 250;

function pruneExpiredEntries(now = Date.now()): void {
  for (const [key, entry] of dashboardCache.entries()) {
    if (entry.expiresAt <= now) {
      dashboardCache.delete(key);
    }
  }
}

function trimCacheSize(): void {
  while (dashboardCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    dashboardCache.delete(oldestKey);
  }
}

export function buildDashboardCacheKey(namespace: string, payload: unknown): string {
  return `${namespace}:${JSON.stringify(payload)}`;
}

export async function getOrCreateDashboardCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  pruneExpiredEntries(now);

  const cached = dashboardCache.get(key) as CacheRecord<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = inflightDashboardCache.get(key) as Promise<T> | undefined;
  if (inflight) {
    return inflight;
  }

  const promise = loader()
    .then((value) => {
      dashboardCache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
      });
      trimCacheSize();
      return value;
    })
    .finally(() => {
      inflightDashboardCache.delete(key);
    });

  inflightDashboardCache.set(key, promise);
  return promise;
}
