/**
 * Flat int8-quantised vector store (one row per chunk, same order as the
 * BM25 docs) + cosine top-k + PCA projection for the viewer.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { EMBED, PATHS } from "../config.ts";

export interface VectorStore {
  dim: number;
  count: number;
  /** int8 codes, row-major. Vectors are unit-norm so scale = 127. */
  codes: Int8Array;
  ids: string[];
  model: string;
}

interface Meta {
  dim: number;
  count: number;
  ids: string[];
  model: string;
}

export function quantize(rows: readonly Float32Array[], ids: string[], model = EMBED.model): VectorStore {
  const dim = rows[0]?.length ?? EMBED.dim;
  const codes = new Int8Array(rows.length * dim);
  rows.forEach((r, i) => {
    for (let j = 0; j < dim; j++) codes[i * dim + j] = Math.max(-127, Math.min(127, Math.round((r[j] ?? 0) * 127)));
  });
  return { dim, count: rows.length, codes, ids, model };
}

export async function saveVectors(v: VectorStore): Promise<void> {
  await mkdir(dirname(PATHS.vectors), { recursive: true });
  await writeFile(PATHS.vectors, new Uint8Array(v.codes.buffer, v.codes.byteOffset, v.codes.byteLength));
  await writeFile(PATHS.vectorsMeta, JSON.stringify({ dim: v.dim, count: v.count, ids: v.ids, model: v.model } satisfies Meta));
}

export async function loadVectors(): Promise<VectorStore | undefined> {
  try {
    const [buf, metaRaw] = await Promise.all([readFile(PATHS.vectors), readFile(PATHS.vectorsMeta, "utf8")]);
    const meta = JSON.parse(metaRaw) as Meta;
    return { ...meta, codes: new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  } catch {
    return undefined;
  }
}

export function row(v: VectorStore, i: number): Float32Array {
  const out = new Float32Array(v.dim);
  for (let j = 0; j < v.dim; j++) out[j] = (v.codes[i * v.dim + j] ?? 0) / 127;
  return out;
}

export function topK(v: VectorStore, q: Float32Array, k: number): Array<{ doc: number; score: number }> {
  const scores: Array<{ doc: number; score: number }> = [];
  for (let i = 0; i < v.count; i++) {
    let dot = 0;
    const off = i * v.dim;
    for (let j = 0; j < v.dim; j++) dot += (v.codes[off + j] ?? 0) * (q[j] ?? 0);
    scores.push({ doc: i, score: dot / 127 });
  }
  return scores.sort((a, b) => b.score - a.score).slice(0, k);
}

// --- PCA (power iteration with deflation) -----------------------------------

export interface Pca {
  mean: Float32Array;
  comps: Float32Array[];
  scale: number;
}

export function fitPca(rows: readonly Float32Array[], dims = 3, iters = 60): Pca {
  const d = rows[0]?.length ?? 0;
  const mean = new Float32Array(d);
  for (const r of rows) for (let j = 0; j < d; j++) mean[j] = (mean[j] ?? 0) + (r[j] ?? 0) / rows.length;
  const centered = rows.map((r) => r.map((x, j) => x - (mean[j] ?? 0)));
  const comps: Float32Array[] = [];
  for (let c = 0; c < dims; c++) {
    let v = new Float32Array(d).map(() => Math.random() - 0.5);
    for (let it = 0; it < iters; it++) {
      const next = new Float32Array(d);
      for (const r of centered) {
        let p = 0;
        for (let j = 0; j < d; j++) p += (r[j] ?? 0) * (v[j] ?? 0);
        for (let j = 0; j < d; j++) next[j] = (next[j] ?? 0) + p * (r[j] ?? 0);
      }
      for (const prev of comps) {
        let p = 0;
        for (let j = 0; j < d; j++) p += (next[j] ?? 0) * (prev[j] ?? 0);
        for (let j = 0; j < d; j++) next[j] = (next[j] ?? 0) - p * (prev[j] ?? 0);
      }
      const norm = Math.hypot(...next) || 1;
      v = next.map((x) => x / norm);
    }
    comps.push(v);
  }
  const pca: Pca = { mean, comps, scale: 1 };
  const maxAbs = Math.max(1e-6, ...rows.flatMap((r) => project(pca, r).map(Math.abs)));
  pca.scale = 1 / maxAbs;
  return pca;
}

export function project(pca: Pca, r: Float32Array): number[] {
  return pca.comps.map((c) => {
    let p = 0;
    for (let j = 0; j < c.length; j++) p += ((r[j] ?? 0) - (pca.mean[j] ?? 0)) * (c[j] ?? 0);
    return p * pca.scale;
  });
}
