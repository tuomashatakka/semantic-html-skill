/**
 * MDN page model: fetch `<slug>/index.json` (rendered, macro-free) and turn
 * it into typed sections, technical summary, attributes and status.
 */
import { MDN } from "../config.ts";
import { type ElementNode, type HtmlNode, collapse, findAll, parseHtml, textContent } from "../html/parse.ts";
import { propertyRows, tables } from "../html/tables.ts";
import { nodesToInline, nodesToMarkdown, statusIcons } from "../html/to-markdown.ts";
import { cachedJson, type CachedFetchOptions, pageCachePath } from "./fetch.ts";

// --- raw MDN JSON shape (only what we read) -------------------------------

interface RawSection {
  type: "prose" | "specifications" | "browser_compatibility" | string;
  value: { id?: string | null; title?: string | null; isH3?: boolean; content?: string; query?: string };
}
export interface RawBaseline {
  baseline?: "high" | "low" | false | "discouraged" | string;
  baseline_low_date?: string;
  baseline_high_date?: string;
}
interface RawDoc {
  title: string;
  short_title?: string;
  summary?: string;
  mdn_url: string;
  pageType?: string;
  modified?: string;
  body: RawSection[];
  status?: RawBaseline;
  baseline?: RawBaseline | null;
  browserCompat?: string[];
  parents?: Array<{ uri: string; title: string }>;
}
interface RawEnvelope {
  doc: RawDoc;
}

// --- model ----------------------------------------------------------------

export interface Section {
  id: string;
  title: string;
  level: 2 | 3;
  /** Parsed prose HTML (empty for spec / compat sections). */
  nodes: HtmlNode[];
}

export interface Page {
  slug: string;
  url: string;
  title: string;
  shortTitle: string;
  summary: string;
  pageType: string;
  modified: string;
  baseline: string;
  deprecated: boolean;
  breadcrumbs: string[];
  browserCompat: string[];
  sections: Section[];
}

export interface Definition {
  name: string;
  tags: string[];
  /** First sentence of the description, plain text. */
  brief: string;
  markdown: string;
}

export const slugFromUrl = (url: string) =>
  url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/[a-zA-Z-]+\/docs\//, "").replace(/[#?].*$/, "").replace(/\/$/, "");

export function baselineLabel(b: RawBaseline | null | undefined): string {
  switch (b?.baseline) {
    case "high":
      return `Baseline widely available${b.baseline_high_date ? ` (since ${b.baseline_high_date.slice(0, 7)})` : ""}`;
    case "low":
      return `Baseline newly available${b.baseline_low_date ? ` (since ${b.baseline_low_date.slice(0, 7)})` : ""}`;
    case false:
      return "Limited availability";
    case "discouraged":
      return "Deprecated";
    default:
      return "";
  }
}

export function toPage(raw: RawDoc): Page {
  const slug = slugFromUrl(raw.mdn_url);
  const sections: Section[] = raw.body
    .filter((s) => s.type === "prose")
    .map((s, i) => ({
    id: s.value.id ?? (i === 0 ? "intro" : `section_${i}`),
    // Section titles are HTML (`Using <code>anchor()</code>…`): keep the text only.
    title: s.value.title ? collapse(textContent(parseHtml(s.value.title))) : i === 0 ? "Introduction" : s.type,
    level: s.value.isH3 ? 3 : 2,
    nodes: s.value.content ? parseHtml(s.value.content) : [],
  }));
  const deprecated = raw.status?.baseline === "discouraged" || raw.baseline?.baseline === "discouraged";
  return {
    slug,
    url: MDN.pageUrl(slug),
    title: raw.title,
    shortTitle: raw.short_title ?? raw.title,
    summary: collapse(raw.summary ?? ""),
    pageType: raw.pageType ?? "",
    modified: raw.modified ?? "",
    baseline: baselineLabel(raw.baseline ?? raw.status),
    deprecated,
    breadcrumbs: (raw.parents ?? []).map((p) => p.title),
    browserCompat: raw.browserCompat ?? [],
    sections,
  };
}

export async function getPage(slug: string, opts?: CachedFetchOptions): Promise<Page> {
  const env = await cachedJson<RawEnvelope>(MDN.docUrl(slug), pageCachePath(slug), opts);
  return toPage(env.doc);
}

// --- extractors -----------------------------------------------------------

export const section = (p: Page, id: string) => p.sections.find((s) => s.id === id);

/** Key/value rows of the "Technical summary" properties table. */
export function technicalSummary(p: Page): Array<[string, string]> {
  const s = section(p, "technical_summary");
  const t = s && tables(s.nodes)[0];
  if (!t) return [];
  return propertyRows(t, (c) => collapse(textContent(c))).map(([k, v]) => [k, nodesToInline(v.children, { links: false })]);
}

/** `<dt>/<dd>` definitions in a section (attributes, values, roles…). */
export function definitions(nodes: readonly HtmlNode[]): Definition[] {
  const out: Definition[] = [];
  for (const dl of topLevel(nodes, "dl")) {
    let current: Definition | undefined;
    for (const c of dl.children) {
      if (c.type !== "element") continue;
      if (c.tag === "dt") {
        const code = findAll([c], (n) => n.tag === "code")[0];
        current = {
          name: collapse(textContent(code ?? c)),
          tags: statusIcons([c]),
          brief: "",
          markdown: "",
        };
        out.push(current);
      } else if (c.tag === "dd" && current) {
        current.markdown = nodesToMarkdown(c.children, { links: false });
        current.brief = firstSentence(nodesToInline(firstBlock(c), { links: false }));
      }
    }
  }
  return out;
}

/** Elements named `tag` that are not nested inside another `tag`. */
export function topLevel(nodes: readonly HtmlNode[], tag: string): ElementNode[] {
  const out: ElementNode[] = [];
  const walk = (list: readonly HtmlNode[]) => {
    for (const n of list) {
      if (n.type !== "element") continue;
      if (n.tag === tag) out.push(n);
      else walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

const firstBlock = (n: ElementNode): HtmlNode[] => {
  const p = n.children.find((c) => c.type === "element" && c.tag === "p");
  return p ? [p] : n.children;
};

export function firstSentence(s: string, max = 220): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  const t = (m?.[1] ?? s).trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * Sections matching any of `wanted` (by id or title substring). Picking an
 * H2 also picks the H3 subsections that follow it.
 */
export function pickSections(p: Page, wanted: readonly string[]): Section[] {
  const want = wanted.map((w) => w.toLowerCase());
  const hit = (s: Section) => want.some((w) => s.id.toLowerCase().includes(w) || s.title.toLowerCase().includes(w));
  const out: Section[] = [];
  let parentPicked = false;
  for (const s of p.sections) {
    if (s.level === 2) parentPicked = hit(s);
    if (parentPicked || hit(s)) out.push(s);
  }
  return out;
}

/** Render a page (or chosen sections) to Markdown. */
export function pageMarkdown(p: Page, opts: { sections?: string[]; links?: boolean } = {}): string {
  const picked = opts.sections ? pickSections(p, opts.sections) : p.sections;
  const head = [`# ${p.title}`, `<${p.url}>`, p.baseline && `_${p.baseline}_`].filter(Boolean).join("\n\n");
  const body = picked.map((s) =>
    [s.id === "intro" ? "" : `${s.level === 3 ? "###" : "##"} ${s.title}`, nodesToMarkdown(s.nodes, { links: opts.links ?? true })]
      .filter(Boolean)
      .join("\n\n"),
  );
  return [head, ...body].join("\n\n");
}
