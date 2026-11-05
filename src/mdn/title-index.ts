/**
 * MDN's site-wide title index (`/en-US/search-index.json`, ~15k pages).
 * Used for discovery (which slugs exist), corpus scoping, and a fast fuzzy
 * title lookup that works before any full-text index is built.
 */
import { MDN, PATHS } from "../config.ts";
import { type CachedFetchOptions, cachedJson } from "./fetch.ts";
import { slugFromUrl } from "./page.ts";

export interface TitleEntry {
  title: string;
  slug: string;
  url: string;
}

interface RawEntry {
  title: string;
  url: string;
}

let memo: TitleEntry[] | undefined;

export async function loadTitleIndex(opts?: CachedFetchOptions): Promise<TitleEntry[]> {
  if (memo && !opts?.refresh) return memo;
  const raw = await cachedJson<RawEntry[]>(MDN.titleIndexUrl, PATHS.titleIndex, opts);
  memo = raw.map((e) => {
    const slug = slugFromUrl(e.url);
    return { title: e.title, slug, url: MDN.pageUrl(slug) };
  });
  return memo;
}

/** Entries whose slug starts with one of `prefixes` (case-insensitive). */
export function inScope(entries: readonly TitleEntry[], prefixes: readonly string[]): TitleEntry[] {
  const ps = prefixes.map((p) => `${p.toLowerCase().replace(/\/$/, "")}`);
  return entries.filter((e) => {
    const s = e.slug.toLowerCase();
    return ps.some((p) => s === p || s.startsWith(`${p}/`));
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[<>()`"']/g, "").replace(/[_\-/:.]+/g, " ").replace(/\s+/g, " ").trim();

/** Score a title/slug against a query. Higher is better; 0 = no match. */
function score(e: TitleEntry, q: string, qTokens: string[], raw: string): number {
  const title = norm(e.title);
  const leaf = norm(e.slug.split("/").pop() ?? "");
  const slug = norm(e.slug);
  let s = 0;
  for (const t of qTokens) {
    if (leaf.split(" ").includes(t)) s += 8;
    else if (title.split(" ").includes(t)) s += 6;
    else if (slug.includes(t)) s += 2;
    else return 0; // every token must appear somewhere
  }
  if (leaf === q || title === q) s += 200;
  if (title.startsWith(q)) s += 40;
  if (leaf.startsWith(q)) s += 35;
  if (title.includes(q)) s += 20;
  // Code-ish queries (`:has()`, `<search>`, `@layer`) — reward a literal hit.
  if (/[<>:@()]/.test(raw) && e.title.toLowerCase().includes(raw)) s += 60;
  // Prefer shorter, more canonical pages and reference sections.
  s -= Math.min(10, e.slug.split("/").length);
  if (/\/reference\//i.test(e.slug)) s += 4;
  if (/^(web\/html|web\/css|web\/accessibility)/i.test(e.slug)) s += 3;
  return s;
}

export function lookupTitle(entries: readonly TitleEntry[], query: string, limit = 10): Array<TitleEntry & { score: number }> {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const raw = query.trim().toLowerCase();
  return entries
    .map((e) => ({ ...e, score: score(e, q, tokens, raw) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.length - b.slug.length)
    .slice(0, limit);
}

/** Resolve a bare HTML element name (`dialog`, `<h1>`) to its reference slug. */
export function elementSlug(name: string): string {
  const n = name.replace(/[<>/\s]/g, "").toLowerCase();
  const leaf = /^h[1-6]$/.test(n) ? "Heading_Elements" : n;
  return `Web/HTML/Reference/Elements/${leaf}`;
}
