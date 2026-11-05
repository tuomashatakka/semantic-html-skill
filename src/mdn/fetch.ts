/**
 * Cached HTTP fetcher: disk cache with TTL + ETag revalidation, retries with
 * backoff, and a tiny concurrency pool. Zero dependencies.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FETCH, PATHS } from "../config.ts";

interface CacheMeta {
  etag?: string;
  fetchedAt: number;
}

export class FetchError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(url: string, status: number, message?: string) {
    super(message ?? `GET ${url} → ${status}`);
    this.url = url;
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
}

async function httpGet(url: string, etag?: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < FETCH.retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": FETCH.userAgent,
          accept: "application/json",
          ...(etag ? { "if-none-match": etag } : {}),
        },
        signal: AbortSignal.timeout(FETCH.timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new FetchError(url, res.status);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface CachedFetchOptions {
  /** Skip TTL and revalidate (still uses ETag). */
  refresh?: boolean;
  /** Never touch the network; fail if not cached. */
  offline?: boolean;
}

/**
 * GET a JSON document through the disk cache at `cachePath`.
 * Stale or missing entries are (re)validated; on network failure a stale
 * copy is returned rather than failing.
 */
export async function cachedJson<T>(url: string, cachePath: string, opts: CachedFetchOptions = {}): Promise<T> {
  const metaPath = `${cachePath}.meta`;
  const [meta, cached] = await Promise.all([readJsonFile<CacheMeta>(metaPath), readJsonFile<T>(cachePath)]);
  const fresh = meta && cached !== undefined && Date.now() - meta.fetchedAt < FETCH.ttlMs;

  if (cached !== undefined && (opts.offline || (fresh && !opts.refresh))) return cached;
  if (opts.offline) throw new FetchError(url, 0, `not cached (offline): ${url}`);

  let res: Response;
  try {
    res = await httpGet(url, cached !== undefined ? meta?.etag : undefined);
  } catch (err) {
    if (cached !== undefined) return cached;
    throw err;
  }

  if (res.status === 304 && cached !== undefined) {
    await writeJsonFile(metaPath, { ...meta, fetchedAt: Date.now() });
    return cached;
  }
  if (!res.ok) throw new FetchError(url, res.status);

  const data = (await res.json()) as T;
  await writeJsonFile(cachePath, data);
  await writeJsonFile(metaPath, { etag: res.headers.get("etag") ?? undefined, fetchedAt: Date.now() } satisfies CacheMeta);
  return data;
}

/** Map an MDN slug to a stable cache file path. */
export function pageCachePath(slug: string): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9/_.-]+/g, "_");
  return join(PATHS.pages, `${safe}.json`);
}

export async function isCached(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Run `fn` over `items` with at most `limit` in flight. Preserves order. */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
