#!/usr/bin/env node
/**
 * Synapse viewer: serves viewer.html plus a JSON API over the local
 * embedding index (requires `mdn index --embed`).
 *
 *   node src/viewer/server.ts          → http://localhost:7341
 *
 *   GET /api/status            index status
 *   GET /api/graph?n=420&k=3   sampled chunks, 3D PCA positions, kNN links
 *   GET /api/search?q=…        hybrid search; hits carry graph_index or p + attach
 */
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { VIEWER } from "../config.ts";
import { loadIndex, search } from "../search/engine.ts";
import { embed } from "../search/embed.ts";
import { type Pca, type VectorStore, fitPca, project, row } from "../search/vectors.ts";
import { readStatus } from "../status.ts";

const HTML = new URL("./viewer.html", import.meta.url);

interface Graph {
  docIdx: number[];
  vecs: Float32Array[];
  pca: Pca;
  byDoc: Map<number, number>;
}
let graph: Graph | undefined;

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
};
const round = (x: number) => Math.round(x * 1e4) / 1e4;

function sample(v: VectorStore, n: number): number[] {
  // Evenly strided sample → covers every section of the corpus.
  const step = Math.max(1, Math.floor(v.count / n));
  const off = Math.floor(Math.random() * step);
  const out: number[] = [];
  for (let i = off; i < v.count && out.length < n; i += step) out.push(i);
  return out;
}

async function buildGraph(n: number, k: number) {
  const idx = await loadIndex();
  if (!idx?.vectors) throw Object.assign(new Error("no embedding index — run `node src/cli.ts index --embed`"), { status: 409 });
  const { bm25, vectors } = idx;
  const docIdx = sample(vectors, n);
  const vecs = docIdx.map((d) => row(vectors, d));
  const pca = fitPca(vecs);
  graph = { docIdx, vecs, pca, byDoc: new Map(docIdx.map((d, i) => [d, i])) };

  const links: Array<[number, number, number]> = [];
  const seen = new Set<string>();
  vecs.forEach((a, i) => {
    const sims = vecs.map((b, j) => ({ j, s: i === j ? -2 : dot(a, b) })).sort((x, y) => y.s - x.s);
    for (const { j, s } of sims.slice(0, k)) {
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([Math.min(i, j), Math.max(i, j), round(s)]);
    }
  });

  const nodes = docIdx.map((d, i) => {
    const doc = bm25.docs[d];
    return {
      id: doc?.id ?? String(d),
      title: doc?.title ?? "",
      path: doc ? `${doc.slug}${doc.heading ? ` › ${doc.heading}` : ""}` : "",
      url: doc?.url ?? "",
      chunk: d,
      p: project(pca, vecs[i] as Float32Array).map((x) => round(x * 6)),
    };
  });
  return { nodes, links, k };
}

async function searchGraph(q: string) {
  const idx = await loadIndex();
  const r = await search(q, { topk: 8, mode: "hybrid" });
  const results = await Promise.all(
    r.results.map(async (h) => {
      const d = h.doc;
      const base = {
        id: h.id,
        title: h.title,
        path: `${h.slug}${h.heading ? ` › ${h.heading}` : ""}`,
        url: h.url,
        score: h.score,
        rerank_score: h.score,
        snippet: h.text.replace(/\s+/g, " ").slice(0, 220),
      };
      if (d !== undefined && graph?.byDoc.has(d)) return { ...base, graph_index: graph.byDoc.get(d) };
      if (!graph) return base;
      const v = d !== undefined && idx?.vectors ? row(idx.vectors, d) : (await embed([h.text]))[0];
      if (!v) return base;
      const attach = graph.vecs
        .map((g, i) => [i, round(dot(g, v))] as [number, number])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      return { ...base, p: project(graph.pca, v).map((x) => round(x * 6)), attach };
    }),
  );
  return { query: q, mode: r.mode, reranked: r.reranked, note: r.note, results };
}

function json(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": buf.length,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(buf);
}

const clamp = (v: string | null, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Number(v ?? d) || d));

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const body = await readFile(HTML);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": body.length });
      return void res.end(body);
    }
    if (url.pathname === "/api/status") {
      const st = await readStatus();
      return json(res, 200, { ...st, doc_count: st.chunks });
    }
    if (url.pathname === "/api/graph") {
      return json(res, 200, await buildGraph(clamp(url.searchParams.get("n"), 50, 1200, 420), clamp(url.searchParams.get("k"), 1, 6, 3)));
    }
    if (url.pathname === "/api/search") {
      const q = url.searchParams.get("q")?.trim();
      return q ? json(res, 200, await searchGraph(q)) : json(res, 400, { error: "empty query" });
    }
    json(res, 404, { error: "not found" });
  } catch (err) {
    const e = err as Error & { status?: number };
    json(res, e.status ?? 500, { error: e.message });
  }
});

server.listen(VIEWER.port, "127.0.0.1", () => console.log(`synapse viewer → http://localhost:${VIEWER.port}`));
