/**
 * Query façade shared by the CLI and the MCP server. Each function returns
 * structured data plus a Markdown rendering; callers choose the view.
 */
import { DEFAULT_SCOPE, PATHS } from "./config.ts";
import { code, codeTags, mdTable, tagList } from "./md.ts";
import { definitions, getPage, pageMarkdown, section, slugFromUrl, technicalSummary } from "./mdn/page.ts";
import { elementSlug, loadTitleIndex, lookupTitle } from "./mdn/title-index.ts";
import { type SearchOptions, type SearchResult, ensureIndex, isBuilding, rebuildInBackground, search } from "./search/engine.ts";
import { embeddingsAvailable } from "./search/embed.ts";
import { readStatus } from "./status.ts";

export interface Rendered<T> {
  data: T;
  markdown: string;
}

const snippet = (t: string, n = 600) => {
  const s = t.trim();
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
};

export async function searchDocs(query: string, opts: SearchOptions & { full?: boolean } = {}): Promise<Rendered<SearchResult>> {
  const r = await search(query, opts);
  const lines = [`**${r.results.length} results** for “${query}” — mode: ${r.mode}${r.reranked ? ", reranked" : ""}`];
  if (r.note) lines.push(`> ${r.note}`);
  r.results.forEach((h, i) => {
    lines.push("", `### ${i + 1}. ${codeTags(h.title)}${h.heading ? ` › ${codeTags(h.heading)}` : ""}`, `<${h.url}>  ·  score ${h.score.toFixed(3)}`);
    if (h.text) lines.push("", opts.full ? h.text : snippet(h.text));
  });
  return { data: r, markdown: lines.join("\n") };
}

/** Resolve user input (slug, URL, element name or title words) to a slug. */
export async function resolveSlug(input: string): Promise<string> {
  const s = input.trim();
  if (/^https?:\/\//.test(s) || s.startsWith("/en-US/docs/")) return slugFromUrl(s);
  if (s.includes("/")) return s;
  const titles = await loadTitleIndex();
  const best = lookupTitle(titles, s, 1)[0];
  if (!best) throw new Error(`No MDN page matches “${input}”`);
  return best.slug;
}

export async function page(input: string, sections?: string[]): Promise<Rendered<{ slug: string; url: string; title: string }>> {
  const slug = await resolveSlug(input);
  const p = await getPage(slug);
  return { data: { slug: p.slug, url: p.url, title: p.title }, markdown: pageMarkdown(p, { sections }) };
}

export interface ElementData {
  name: string;
  url: string;
  summary: string;
  baseline: string;
  deprecated: boolean;
  technicalSummary: Record<string, string>;
  attributes: Array<{ name: string; tags: string[]; brief: string }>;
}

export async function element(name: string, opts: { full?: boolean } = {}): Promise<Rendered<ElementData>> {
  const p = await getPage(elementSlug(name));
  const ts = technicalSummary(p);
  const attrs = [
    ...definitions(section(p, "attributes")?.nodes ?? []),
    ...definitions(section(p, "deprecated_attributes")?.nodes ?? []).map((d) => ({ ...d, tags: ["deprecated", ...d.tags] })),
  ];
  const data: ElementData = {
    name: p.shortTitle,
    url: p.url,
    summary: p.summary,
    baseline: p.baseline,
    deprecated: p.deprecated,
    technicalSummary: Object.fromEntries(ts),
    attributes: attrs.map(({ name: n, tags, brief }) => ({ name: n, tags, brief })),
  };
  const md = [
    `# ${code(p.shortTitle)}${tagList([p.deprecated ? "deprecated" : "", p.baseline].filter(Boolean))}`,
    `<${p.url}>`,
    "",
    codeTags(p.summary),
    "",
    mdTable(["Technical summary", ""], ts),
    "",
    attrs.length ? "## Attributes (plus global attributes)" : "",
    ...attrs.map((a) => `- ${code(a.name)}${tagList(a.tags)} — ${a.brief}`),
  ];
  if (opts.full) md.push("", pageMarkdown(p, { sections: ["accessibility", "usage_notes", "description"] }));
  return { data, markdown: md.filter((l, i, a) => l || a[i - 1]).join("\n") };
}

export async function titles(query: string, limit = 10): Promise<Rendered<Array<{ title: string; url: string; slug: string }>>> {
  const hits = lookupTitle(await loadTitleIndex(), query, limit).map(({ title, url, slug }) => ({ title, url, slug }));
  return { data: hits, markdown: hits.map((h) => `- ${codeTags(h.title)} — <${h.url}>`).join("\n") || "_no matches_" };
}

export async function status(): Promise<Rendered<Record<string, unknown>>> {
  const st = await readStatus();
  const data = {
    ...st,
    building: isBuilding(),
    embeddingsPackage: await embeddingsAvailable(),
    defaultScope: DEFAULT_SCOPE,
    cache: PATHS,
  };
  return { data, markdown: "```json\n" + JSON.stringify(data, null, 2) + "\n```" };
}

export { ensureIndex, rebuildInBackground };
