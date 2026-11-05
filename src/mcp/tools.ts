/**
 * MCP tool definitions: JSON Schema + pure handlers over the lookup façade.
 * Transport-agnostic; `server.ts` owns framing and protocol eras.
 */
import * as lookup from "../lookup.ts";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run: (args: Record<string, unknown>) => Promise<lookup.Rendered<unknown>>;
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new TypeError(`argument \`${name}\` must be a non-empty string`);
  return v;
};
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(1, Math.min(50, v)) : fallback);
const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

export const TOOLS: readonly ToolDef[] = [
  {
    name: "search_mdn",
    title: "Search MDN",
    description:
      "Full-text search over MDN (HTML, CSS, ARIA/accessibility, structuring-content guides). BM25, or hybrid semantic + cross-encoder rerank when the embedding index is built. Returns ranked section chunks with live MDN URLs. Use for element choice, ARIA correctness, CSS-native alternatives to JS, attribute/property behaviour.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: 'Natural-language or code-ish query, e.g. "when to use <dialog> vs role=dialog"' },
        topk: { type: "integer", minimum: 1, maximum: 50, default: 5 },
        prefix: { type: "string", description: 'Restrict to a slug prefix, e.g. "Web/CSS" or "Web/Accessibility/ARIA"' },
        rerank: { type: "boolean", description: "Cross-encoder rerank (needs embeddings). Defaults on in hybrid mode." },
        full: { type: "boolean", description: "Return full chunk text instead of snippets" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a) =>
      lookup.searchDocs(str(a.query, "query"), {
        topk: num(a.topk, 5),
        prefix: typeof a.prefix === "string" ? a.prefix : undefined,
        rerank: typeof a.rerank === "boolean" ? a.rerank : undefined,
        full: a.full === true,
      }),
  },
  {
    name: "get_element",
    title: "HTML element reference",
    description:
      "Technical summary of an HTML element from MDN: content categories, permitted content & parents, tag omission, implicit and permitted ARIA roles, DOM interface, attributes (with deprecated/experimental flags) and Baseline status. Set full=true to add its description, usage and accessibility sections.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Element name, e.g. "dialog", "<search>", "h2"' },
        full: { type: "boolean" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a) => lookup.element(str(a.name, "name"), { full: a.full === true }),
  },
  {
    name: "get_mdn_page",
    title: "Read an MDN page",
    description:
      "Render any MDN page as Markdown (live, cached). Accepts a slug (Web/CSS/Reference/At-rules/@layer), a URL, or title words. Optionally restrict to sections by id/title substring (e.g. ['accessibility','examples']).",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "string" },
        sections: { type: "array", items: { type: "string" } },
      },
      required: ["page"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a) =>
      lookup.page(
        str(a.page, "page"),
        Array.isArray(a.sections) ? a.sections.filter((s): s is string => typeof s === "string") : undefined,
      ),
  },
  {
    name: "lookup_mdn_title",
    title: "Find MDN pages by title",
    description: "Fuzzy title/slug lookup across all ~15k MDN pages (any area, incl. Web/API, JavaScript, HTTP). Works before the full-text index exists.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: (a) => lookup.titles(str(a.query, "query"), num(a.limit, 10)),
  },
  {
    name: "index_status",
    title: "MDN index status",
    description: "State of the local search index (ready / fetching / indexing / embedding / missing), chunk counts, embedding availability, cache paths.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: true },
    run: () => lookup.status(),
  },
  {
    name: "reindex_mdn",
    title: "Rebuild MDN index",
    description:
      "Rebuild the search index in the background (revalidates cached pages). Set embed=true to also build the semantic index (needs @huggingface/transformers). Poll index_status.",
    inputSchema: {
      type: "object",
      properties: {
        embed: { type: "boolean" },
        scope: { type: "array", items: { type: "string" }, description: 'Slug prefixes, e.g. ["Web/HTML","Web/CSS","Web/API"]' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
    run: async (a) => {
      const started = lookup.rebuildInBackground({
        refresh: true,
        embed: a.embed === true ? true : undefined,
        scope: Array.isArray(a.scope) ? a.scope.filter((s): s is string => typeof s === "string") : undefined,
      });
      const data = { started, note: started ? "rebuilding in background; poll index_status" : "a build is already running" };
      return { data, markdown: data.note };
    },
  },
];

export const toolList = () => TOOLS.map(({ run: _run, ...def }) => def);

export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  try {
    const r = await tool.run(args);
    const structured = Array.isArray(r.data) ? { items: r.data } : (r.data as Record<string, unknown>);
    return { content: [{ type: "text", text: r.markdown }], structuredContent: structured };
  } catch (err) {
    return { content: [{ type: "text", text: `${name} failed: ${(err as Error).message}` }], isError: true };
  }
}
