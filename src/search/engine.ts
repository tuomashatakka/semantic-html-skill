/**
 * Search engine: builds the corpus from MDN (title index → scoped slugs →
 * cached page JSON → chunks), persists BM25 (+ optional int8 vectors), and
 * answers hybrid queries.
 */
import { readFile } from "node:fs/promises";
import { DEFAULT_SCOPE, EMBED, FETCH, PATHS, SEARCH } from "../config.ts";
import { isCached, mapPool, writeJsonFile } from "../mdn/fetch.ts";
import { getPage } from "../mdn/page.ts";
import { inScope, loadTitleIndex, lookupTitle } from "../mdn/title-index.ts";
import { buildRunning, readStatus, writeStatus } from "../status.ts";
import { type Bm25Index, buildBm25, searchBm25 } from "./bm25.ts";
import { type Chunk, chunkPage } from "./chunk.ts";
import { embed, embeddingsAvailable, rerankScores } from "./embed.ts";
import { type VectorStore, loadVectors, quantize, saveVectors, topK } from "./vectors.ts";

export interface BuildOptions {
  scope?: readonly string[];
  embed?: boolean;
  refresh?: boolean;
  onProgress?: (msg: string) => void;
}

export interface SearchOptions {
  topk?: number;
  /** Cross-encoder rerank (needs embeddings package). Default: on when available. */
  rerank?: boolean;
  mode?: "auto" | "bm25" | "hybrid";
  /** Restrict to slugs with this prefix, e.g. "Web/CSS". */
  prefix?: string;
}

export interface SearchHit {
  /** Chunk id (`slug#section`). */
  id: string;
  /** Row in the loaded index (BM25 docs / vectors); absent for title-only hits. */
  doc?: number;
  title: string;
  heading: string;
  url: string;
  slug: string;
  score: number;
  text: string;
}

export interface SearchResult {
  query: string;
  mode: "bm25" | "hybrid" | "titles";
  reranked: boolean;
  note?: string;
  results: SearchHit[];
}

// --- build ------------------------------------------------------------------

let building: Promise<void> | undefined;

export async function buildIndex(opts: BuildOptions = {}): Promise<void> {
  const scope = opts.scope?.length ? opts.scope : DEFAULT_SCOPE;
  const log = opts.onProgress ?? (() => {});
  const wantEmbed = opts.embed ?? EMBED.enabled;
  const current = await readStatus();
  if (buildRunning(current)) throw new Error(`another build is running (pid ${current.pid}); poll status`);

  await writeStatus({ state: "fetching", detail: "title index", scope: [...scope] });
  const titles = await loadTitleIndex({ refresh: opts.refresh });
  const entries = inScope(titles, scope);
  log(`${entries.length} pages in scope (${scope.join(", ")})`);

  let done = 0;
  const pages = await mapPool(entries, FETCH.concurrency, async (e) => {
    try {
      return await getPage(e.slug, { refresh: opts.refresh });
    } catch (err) {
      log(`skip ${e.slug}: ${(err as Error).message}`);
      return undefined;
    } finally {
      done++;
      if (done % 50 === 0 || done === entries.length) {
        log(`fetched ${done}/${entries.length}`);
        await writeStatus({ state: "fetching", done, total: entries.length, scope: [...scope] });
      }
    }
  });

  await writeStatus({ state: "indexing", detail: "bm25", scope: [...scope] });
  const chunks: Chunk[] = pages.flatMap((p) => (p ? chunkPage(p) : []));
  const bm25 = buildBm25(chunks);
  await writeJsonFile(PATHS.bm25, bm25);
  log(`indexed ${chunks.length} chunks (bm25)`);

  let embedded = false;
  if (wantEmbed) {
    if (!(await embeddingsAvailable())) {
      log("embeddings requested but @huggingface/transformers is not installed — BM25 only");
    } else {
      const texts = chunks.map((c) => `${c.title}${c.heading ? ` — ${c.heading}` : ""}\n${c.text}`);
      const rows: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += 256) {
        rows.push(...(await embed(texts.slice(i, i + 256))));
        log(`embedded ${rows.length}/${texts.length}`);
        await writeStatus({ state: "embedding", done: rows.length, total: texts.length, scope: [...scope] });
      }
      await saveVectors(quantize(rows, chunks.map((c) => c.id)));
      embedded = true;
    }
  }

  cache = undefined;
  await writeStatus({
    state: "ready",
    chunks: chunks.length,
    pages: pages.filter(Boolean).length,
    embeddings: embedded || (await loadVectors().then((v) => v !== undefined && vectorsMatch(v, bm25))),
    scope: [...scope],
    builtAt: new Date().toISOString(),
  });
}

/** Start a build in the background unless one is running or the index exists. */
export async function ensureIndex(opts: BuildOptions = {}): Promise<"ready" | "building"> {
  if (await indexExists()) return "ready";
  building ??= buildIndex(opts)
    .catch(async (err: Error) => {
      await writeStatus({ state: "error", detail: err.message });
    })
    .finally(() => {
      building = undefined;
    });
  return "building";
}

export const isBuilding = () => building !== undefined;

export function rebuildInBackground(opts: BuildOptions = {}): boolean {
  if (building) return false;
  building = buildIndex(opts)
    .catch(async (err: Error) => writeStatus({ state: "error", detail: err.message }))
    .finally(() => {
      building = undefined;
    });
  return true;
}

/** Vectors are row-aligned with BM25 docs; a BM25-only rebuild can invalidate them. */
const vectorsMatch = (v: VectorStore, bm25: Bm25Index) =>
  v.count === bm25.docs.length && v.ids.every((id, i) => bm25.docs[i]?.id === id);

// --- load -------------------------------------------------------------------

interface Loaded {
  bm25: Bm25Index;
  vectors?: VectorStore;
  mtime: string;
}
let cache: Loaded | undefined;

export const indexExists = () => isCached(PATHS.bm25);

export async function loadIndex(): Promise<Loaded | undefined> {
  const status = await readStatus();
  if (cache && cache.mtime === status.builtAt) return cache;
  try {
    const bm25 = JSON.parse(await readFile(PATHS.bm25, "utf8")) as Bm25Index;
    const v = await loadVectors();
    const vectors = v && vectorsMatch(v, bm25) ? v : undefined;
    cache = { bm25, vectors, mtime: status.builtAt ?? "" };
    return cache;
  } catch {
    return undefined;
  }
}

// --- search -----------------------------------------------------------------

function rrf(lists: ReadonlyArray<ReadonlyArray<{ doc: number }>>): Array<{ doc: number; score: number }> {
  const s = new Map<number, number>();
  for (const list of lists) list.forEach((h, rank) => s.set(h.doc, (s.get(h.doc) ?? 0) + 1 / (SEARCH.rrfK + rank + 1)));
  return [...s].map(([doc, score]) => ({ doc, score })).sort((a, b) => b.score - a.score);
}

/** Keep at most `perPage` chunks per page, preserving order. */
function diversify<T extends { slug: string }>(hits: readonly T[], perPage = 2): T[] {
  const n = new Map<string, number>();
  return hits.filter((h) => {
    const c = (n.get(h.slug) ?? 0) + 1;
    n.set(h.slug, c);
    return c <= perPage;
  });
}

async function titleFallback(query: string, topk: number, note: string): Promise<SearchResult> {
  const titles = await loadTitleIndex().catch(() => []);
  return {
    query,
    mode: "titles",
    reranked: false,
    note,
    results: lookupTitle(titles, query, topk).map((t) => ({
      id: t.slug,
      title: t.title,
      heading: "",
      url: t.url,
      slug: t.slug,
      score: t.score,
      text: "",
    })),
  };
}

export async function search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const topk = opts.topk ?? 5;
  const idx = await loadIndex();
  if (!idx) {
    const state = await ensureIndex();
    const st = await readStatus();
    const progress = st.total ? ` (${st.state} ${st.done ?? 0}/${st.total})` : "";
    return titleFallback(query, topk, `full-text index ${state}${progress}; showing title matches meanwhile`);
  }

  const { bm25, vectors } = idx;
  const inPrefix = (d: number) => !opts.prefix || (bm25.docs[d]?.slug.toLowerCase().startsWith(opts.prefix.toLowerCase()) ?? false);
  const lexical = searchBm25(bm25, query, SEARCH.fetchK * 3).filter((h) => inPrefix(h.doc)).slice(0, SEARCH.fetchK);

  let mode: SearchResult["mode"] = "bm25";
  let note: string | undefined;
  let fused: Array<{ doc: number; score: number }> = lexical;

  const wantHybrid = opts.mode === "hybrid" || (opts.mode !== "bm25" && vectors !== undefined);
  if (wantHybrid) {
    if (!vectors) note = "no embedding index (run `mdn index --embed`); BM25 only";
    else {
      try {
        const [q] = await embed([query]);
        if (q) {
          const semantic = topK(vectors, q, SEARCH.fetchK * 3).filter((h) => inPrefix(h.doc)).slice(0, SEARCH.fetchK);
          fused = rrf([lexical, semantic]);
          mode = "hybrid";
        }
      } catch (err) {
        note = (err as Error).message;
      }
    }
  }

  let hits: SearchHit[] = fused.slice(0, SEARCH.fetchK).flatMap(({ doc, score }) => {
    const d = bm25.docs[doc];
    return d ? [{ id: d.id, doc, title: d.title, heading: d.heading, url: d.url, slug: d.slug, score, text: d.text }] : [];
  });

  let reranked = false;
  const wantRerank = opts.rerank ?? mode === "hybrid";
  if (wantRerank && hits.length) {
    try {
      const pool = hits.slice(0, 25);
      const scores = await rerankScores(
        query,
        pool.map((h) => `${h.title} ${h.heading}\n${h.text}`),
      );
      hits = pool.map((h, i) => ({ ...h, score: scores[i] ?? 0 })).sort((a, b) => b.score - a.score);
      reranked = true;
    } catch (err) {
      note ??= (err as Error).message;
    }
  }

  return { query, mode, reranked, note, results: diversify(hits).slice(0, topk) };
}
