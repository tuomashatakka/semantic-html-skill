/**
 * Zero-dependency BM25F over chunks. The tokenizer keeps web-platform
 * tokens intact (`<dialog>` → `dialog` + `<dialog>`, `aria-label`,
 * `:has`, `@layer`) so code-ish queries match precisely.
 */
import { SEARCH } from "../config.ts";
import type { Chunk } from "./chunk.ts";

const STOP = new Set(
  "a an and are as at be but by can do does for from has have how i if in into is it its of on or should so than that the their then there these this to use used using vs was what when where which while who why will with you your".split(
    " ",
  ),
);

/** Light English stemmer: enough to fold plurals and -ing/-ed forms. */
function stem(t: string): string {
  if (t.length <= 4 || /[^a-z]/.test(t)) return t;
  return t.replace(/(ies)$/, "y").replace(/(sses|ches|shes|xes)$/, (m) => m.slice(0, -2)).replace(/([^s])s$/, "$1").replace(/(ing|ed)$/, "");
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  // Exact platform tokens first.
  for (const m of lower.matchAll(/<\/?([a-z][a-z0-9-]*)>|(@[a-z-]+)|(::?[a-z][a-z-]*)(?=[\s(),.;]|$)|\b(aria-[a-z]+)\b/g)) {
    if (m[1]) out.push(`<${m[1]}>`);
    else if (m[2]) out.push(m[2]);
    else if (m[3]) out.push(m[3]);
    else if (m[4]) out.push(m[4]);
  }
  for (const w of lower.split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

type Field = "title" | "heading" | "text";
const FIELDS: readonly Field[] = ["title", "heading", "text"];
const BOOST: Record<Field, number> = { title: SEARCH.bm25.titleBoost, heading: SEARCH.bm25.headingBoost, text: 1 };

export interface Bm25Index {
  version: 1;
  docs: Array<Pick<Chunk, "id" | "slug" | "url" | "title" | "heading" | "text">>;
  /** term → [docIndex, tfTitle, tfHeading, tfText][] */
  postings: Record<string, number[][]>;
  lengths: number[][];
  avg: number[];
}

export function buildBm25(chunks: readonly Chunk[]): Bm25Index {
  // Null-prototype map: tokens like `constructor` must not hit Object.prototype.
  const postings: Record<string, number[][]> = Object.create(null);
  const lengths: number[][] = [];
  const sums = [0, 0, 0];
  chunks.forEach((c, d) => {
    const counts = new Map<string, number[]>();
    const lens = FIELDS.map((f, fi) => {
      const toks = tokenize(c[f]);
      for (const t of toks) {
        const row = counts.get(t) ?? [0, 0, 0];
        row[fi] = (row[fi] ?? 0) + 1;
        counts.set(t, row);
      }
      sums[fi] = (sums[fi] ?? 0) + toks.length;
      return toks.length;
    });
    lengths.push(lens);
    for (const [t, tf] of counts) (postings[t] ??= []).push([d, ...tf]);
  });
  const n = Math.max(1, chunks.length);
  return {
    version: 1,
    docs: chunks.map(({ id, slug, url, title, heading, text }) => ({ id, slug, url, title, heading, text })),
    postings,
    lengths,
    avg: sums.map((s) => s / n || 1),
  };
}

export interface ScoredDoc {
  doc: number;
  score: number;
}

export function searchBm25(index: Bm25Index, query: string, k: number): ScoredDoc[] {
  const { k1, b } = SEARCH.bm25;
  const N = index.docs.length;
  const scores = new Map<number, number>();
  for (const term of new Set(tokenize(query))) {
    if (!Object.hasOwn(index.postings, term)) continue;
    const plist = index.postings[term] as number[][];
    const idf = Math.log(1 + (N - plist.length + 0.5) / (plist.length + 0.5));
    for (const [d = 0, ...tfs] of plist) {
      const lens = index.lengths[d] ?? [1, 1, 1];
      // BM25F: combine per-field normalised tf with boosts, then saturate once.
      let tf = 0;
      FIELDS.forEach((f, fi) => {
        const raw = tfs[fi] ?? 0;
        if (!raw) return;
        tf += (BOOST[f] * raw) / (1 - b + (b * (lens[fi] ?? 0)) / (index.avg[fi] ?? 1));
      });
      scores.set(d, (scores.get(d) ?? 0) + (idf * tf) / (k1 + tf));
    }
  }
  return [...scores].map(([doc, score]) => ({ doc, score })).sort((x, y) => y.score - x.score).slice(0, k);
}
