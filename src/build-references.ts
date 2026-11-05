#!/usr/bin/env node
/**
 * Generate the offline reference digest from live MDN (rendered JSON, cached).
 *
 *   node src/build-references.ts [--refresh] [--offline]
 *
 * Writes (generated; curated files are never touched):
 *   references/content-categories.md
 *   references/elements/index.md + references/elements/<group>.md
 *   references/global-attributes.md
 *   references/aria-index.md
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { FETCH, REFERENCES_DIR } from "./config.ts";
import { type ElementNode, type HtmlNode, collapse, findAll, textContent } from "./html/parse.ts";
import { tableRows, tables } from "./html/tables.ts";
import { nodesToInline, nodesToMarkdown } from "./html/to-markdown.ts";
import { anchor, code, generatedHeader, mdTable, tagList } from "./md.ts";
import { type CachedFetchOptions, mapPool } from "./mdn/fetch.ts";
import { type Page, definitions, getPage, pickSections, section, slugFromUrl, technicalSummary } from "./mdn/page.ts";

const SLUGS = {
  elements: "Web/HTML/Reference/Elements",
  categories: "Web/HTML/Guides/Content_categories",
  globalAttrs: "Web/HTML/Reference/Global_attributes",
  roles: "Web/Accessibility/ARIA/Reference/Roles",
  ariaAttrs: "Web/Accessibility/ARIA/Reference/Attributes",
} as const;

/** Elements-page group id → output file stem. */
const GROUP_FILES: Record<string, string> = {
  main_root: "document-and-metadata",
  document_metadata: "document-and-metadata",
  sectioning_root: "sectioning",
  content_sectioning: "sectioning",
  text_content: "text-content",
  inline_text_semantics: "inline-text",
  image_and_multimedia: "media-and-embedded",
  embedded_content: "media-and-embedded",
  svg_and_mathml: "media-and-embedded",
  scripting: "scripting-and-edits",
  demarcating_edits: "scripting-and-edits",
  table_content: "tables",
  forms: "forms",
  interactive_elements: "interactive-and-components",
  web_components: "interactive-and-components",
  obsolete_and_deprecated_elements: "obsolete",
};

const SUMMARY_KEYS = [
  "Content categories",
  "Permitted content",
  "Tag omission",
  "Permitted parents",
  "Implicit ARIA role",
  "Permitted ARIA roles",
  "DOM interface",
] as const;

interface ElementInfo {
  name: string;
  slug: string;
  group: string;
  groupTitle: string;
  description: string;
  page?: Page;
  summary: Map<string, string>;
}

const log = (...a: unknown[]) => console.error("[build-refs]", ...a);

// --- element list ---------------------------------------------------------

function elementTable(nodes: readonly HtmlNode[]): Array<{ names: string[]; slug: string; description: string }> {
  const out: Array<{ names: string[]; slug: string; description: string }> = [];
  for (const t of tables(nodes)) {
    for (const [nameCell, descCell] of tableRows(t)) {
      if (!nameCell || !descCell || nameCell.tag !== "td") continue;
      const link = findAll([nameCell], (n) => n.tag === "a")[0];
      const names = findAll([nameCell], (n) => n.tag === "code").map((c) => collapse(textContent(c)));
      if (!link?.attrs.href || !names.length) continue;
      out.push({ names, slug: slugFromUrl(link.attrs.href), description: nodesToInline(descCell.children, { links: false }) });
    }
  }
  return out;
}

async function collectElements(opts: CachedFetchOptions): Promise<ElementInfo[]> {
  const index = await getPage(SLUGS.elements, opts);
  const items: ElementInfo[] = [];
  const seen = new Set<string>();
  for (const s of index.sections) {
    if (!GROUP_FILES[s.id]) continue;
    for (const row of elementTable(s.nodes)) {
      const key = `${s.id}:${row.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        name: row.names.join(", "),
        slug: row.slug,
        group: s.id,
        groupTitle: s.title,
        description: row.description,
        summary: new Map(),
      });
    }
  }
  log(`${items.length} element entries; fetching pages…`);
  await mapPool(items, FETCH.concurrency, async (el) => {
    try {
      el.page = await getPage(el.slug, opts);
      el.summary = new Map(technicalSummary(el.page));
    } catch (err) {
      log(`skip ${el.slug}: ${(err as Error).message}`);
    }
  });
  return items;
}

// --- renderers -------------------------------------------------------------

/** `<a>, <b>` → `` `<a>`, `<b>` `` so raw tag names never leak into Markdown as HTML. */
const codeNames = (names: string) => names.split(", ").map(code).join(", ");

const statusOf = (el: ElementInfo) => {
  const tags: string[] = [];
  if (el.page?.deprecated || el.group === "obsolete_and_deprecated_elements") tags.push("deprecated");
  const b = el.page?.baseline;
  if (b && !b.startsWith("Deprecated")) tags.push(b);
  return tags;
};

function renderElement(el: ElementInfo): string {
  const p = el.page;
  const out: string[] = [`### ${codeNames(el.name)}`, ""];
  out.push(`${el.description}${tagList(statusOf(el))}`, "", `MDN: <${p?.url ?? el.slug}>`, "");
  const rows = SUMMARY_KEYS.flatMap((k) => (el.summary.get(k) ? [[k, el.summary.get(k) as string]] : []));
  if (rows.length) out.push(mdTable(["Technical summary", ""], rows), "");

  if (p) {
    const attrs = [
      ...definitions(section(p, "attributes")?.nodes ?? []),
      ...definitions(section(p, "deprecated_attributes")?.nodes ?? []).map((d) => ({
        ...d,
        tags: [...new Set(["deprecated", ...d.tags])],
      })),
    ].filter((d) => d.name);
    if (attrs.length) {
      out.push("**Attributes** (plus global attributes):", "");
      for (const a of attrs) out.push(`- ${code(a.name)}${tagList(a.tags)} — ${a.brief}`);
      out.push("");
    }
    const a11y = pickSections(p, ["accessibility"]).filter((s) => s.level === 3);
    if (a11y.length) out.push(`**Accessibility notes on MDN:** ${a11y.map((s) => s.title).join(" · ")}`, "");
  }
  return out.join("\n");
}

async function writeElements(items: ElementInfo[]): Promise<void> {
  const dir = join(REFERENCES_DIR, "elements");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const byFile = new Map<string, ElementInfo[]>();
  for (const el of items) {
    const f = GROUP_FILES[el.group] as string;
    byFile.set(f, [...(byFile.get(f) ?? []), el]);
  }

  for (const [file, els] of byFile) {
    const groups = [...new Set(els.map((e) => e.groupTitle))];
    const body: string[] = [generatedHeader(`<https://developer.mozilla.org/en-US/docs/${SLUGS.elements}>`), "", `# ${groups.join(" · ")}`, ""];
    for (const g of groups) {
      body.push(`## ${g}`, "");
      for (const el of els.filter((e) => e.groupTitle === g)) body.push(renderElement(el));
    }
    await writeFile(join(dir, `${file}.md`), `${body.join("\n").trim()}\n`);
  }

  const index = [
    generatedHeader(`<https://developer.mozilla.org/en-US/docs/${SLUGS.elements}>`),
    "",
    "# HTML elements — index",
    "",
    "Every element MDN lists, with its group file. Open the group file for the technical summary",
    "(content categories, permitted content/parents, implicit ARIA role) and the attribute list.",
    "",
    mdTable(
      ["Element", "What it is", "Implicit role", "Status", "File"],
      [...items]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((el) => {
          const f = GROUP_FILES[el.group] as string;
          return [
            codeNames(el.name),
            el.description,
            el.summary.get("Implicit ARIA role") ?? "",
            statusOf(el).join(", "),
            `[${f}](${f}.md#${anchor(codeNames(el.name))})`,
          ];
        }),
    ),
  ];
  await writeFile(join(dir, "index.md"), `${index.join("\n")}\n`);
}

// --- content categories ----------------------------------------------------

/** Element names (as `<x>`) listed in `<li>`s of a category section, split by conditional or not. */
function categoryMembers(nodes: readonly HtmlNode[]): { always: string[]; conditional: Array<[string, string]> } {
  const always: string[] = [];
  const conditional: Array<[string, string]> = [];
  for (const li of findAll(nodes, (n) => n.tag === "li")) {
    const first = findAll([li], (n) => n.tag === "code")[0];
    const name = first ? collapse(textContent(first)) : "";
    if (!/^<[\w-]+>$/.test(name)) continue;
    const text = nodesToInline(li.children, { links: false });
    const head = `\`${name}\``;
    const cond = text.slice(text.indexOf(head) + head.length).replace(/^[,\s]+/, "");
    if (cond && /^(if|when|unless|but|only)/i.test(cond)) conditional.push([name, cond]);
    else always.push(name);
  }
  return { always: [...new Set(always)], conditional };
}

const CATEGORY_KEYWORD: Record<string, string> = {
  metadata_content: "metadata content",
  flow_content: "flow content",
  sectioning_content: "sectioning content",
  heading_content: "heading content",
  phrasing_content: "phrasing content",
  embedded_content: "embedded content",
  interactive_content: "interactive content",
  palpable_content: "palpable content",
};

async function writeContentCategories(items: ElementInfo[], opts: CachedFetchOptions): Promise<void> {
  const p = await getPage(SLUGS.categories, opts);
  const out: string[] = [generatedHeader(`<${p.url}>`), "", "# Content categories — what may nest in what", ""];
  out.push(
    "Every HTML element belongs to zero or more **content categories**; an element's *permitted content*",
    "and *permitted parents* are stated in terms of these categories. Check them before nesting:",
    "invalid nesting is silently repaired by the parser and corrupts the DOM and accessibility tree.",
    "",
    `Source: <${p.url}>`,
    "",
  );

  const toc = p.sections.filter((s) => s.id !== "intro" && s.id !== "see_also");
  out.push(toc.map((s) => `- [${s.title}](#${anchor(s.title)})`).join("\n"), "");

  for (const s of p.sections) {
    if (s.id === "see_also") continue;
    if (s.id !== "intro") out.push(`## ${s.title}`, "");
    out.push(nodesToMarkdown(s.nodes, { links: false }), "");
    const kw = CATEGORY_KEYWORD[s.id];
    if (!kw) continue;
    const crossCheck = s.id !== "palpable_content";
    const { always, conditional } = categoryMembers(s.nodes);
    if (always.length || conditional.length) {
      out.push(`**Members at a glance:** ${always.map(code).join(" ")}`);
      if (conditional.length) out.push("", "**Conditional:**", ...conditional.map(([n, c]) => `- ${code(n)} — ${c}`));
      out.push("");
    }
    // Cross-check against each element's own technical summary.
    for (const n of crossCheck ? always : []) {
      const el = items.find((e) => e.name.split(", ").includes(n));
      const cats = el?.summary.get("Content categories")?.toLowerCase();
      if (cats && !cats.includes(kw) && !cats.includes(kw.split(" ")[0] as string)) {
        log(`note: ${n} listed under "${s.title}" but its technical summary says: ${cats}`);
      }
    }
  }

  out.push("## Element matrix (from each element's technical summary)", "");
  out.push(
    mdTable(
      ["Element", "Content categories", "Permitted content", "Permitted parents"],
      items
        .filter((e) => e.summary.size && e.group !== "obsolete_and_deprecated_elements")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => [
          codeNames(e.name),
          e.summary.get("Content categories") ?? "",
          e.summary.get("Permitted content") ?? "",
          e.summary.get("Permitted parents") ?? "",
        ]),
    ),
    "",
  );
  await writeFile(join(REFERENCES_DIR, "content-categories.md"), `${out.join("\n").trim()}\n`);
}

// --- global attributes -----------------------------------------------------

async function writeGlobalAttributes(opts: CachedFetchOptions): Promise<void> {
  const p = await getPage(SLUGS.globalAttrs, opts);
  const intro = nodesToMarkdown(section(p, "intro")?.nodes ?? [], { links: false });
  const attrs = definitions(section(p, "list_of_global_attributes")?.nodes ?? []);
  const events = definitions(section(p, "list_of_global_event_handler_attributes")?.nodes ?? []);
  const out = [
    generatedHeader(`<${p.url}>`),
    "",
    "# Global attributes",
    "",
    intro,
    "",
    "## Attributes",
    "",
    mdTable(
      ["Attribute", "Purpose"],
      attrs.map((a) => [`${code(a.name)}${tagList(a.tags)}`, a.brief]),
    ),
    "",
    "## Event handler attributes",
    "",
    "Inline `on*` handlers are discouraged: attach listeners in script (`addEventListener`) or, better,",
    "use a declarative platform feature (see `native-over-js.md`).",
    "",
    events.map((e) => code(e.name)).join(" "),
    "",
  ];
  await writeFile(join(REFERENCES_DIR, "global-attributes.md"), `${out.join("\n").trim()}\n`);
}

// --- ARIA index --------------------------------------------------------------

const cleanAriaName = (s: string) => s.replace(/^ARIA:\s*/i, "").replace(/\s+(role|attribute)$/i, "");

function codeList(nodes: readonly HtmlNode[]): string[] {
  return findAll(nodes, (n) => n.tag === "li").map((li: ElementNode) => collapse(textContent(li)));
}

async function writeAriaIndex(items: ElementInfo[], opts: CachedFetchOptions): Promise<void> {
  const [roles, attrs] = await Promise.all([getPage(SLUGS.roles, opts), getPage(SLUGS.ariaAttrs, opts)]);
  const out: string[] = [
    generatedHeader(`<${roles.url}> and <${attrs.url}>`),
    "",
    "# ARIA index — implicit roles, roles, states & properties",
    "",
    "Read `aria.md` first: native semantics beat ARIA. This file is the lookup table.",
    "",
    "## Element → implicit ARIA role (don't re-declare these)",
    "",
    mdTable(
      ["Element", "Implicit role", "Permitted roles"],
      items
        .filter((e) => e.summary.get("Implicit ARIA role") && e.group !== "obsolete_and_deprecated_elements")
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => [codeNames(e.name), e.summary.get("Implicit ARIA role") ?? "", e.summary.get("Permitted ARIA roles") ?? ""]),
    ),
    "",
    "## Role categories",
    "",
  ];
  for (const s of roles.sections) {
    if (!/^\d\./.test(s.title)) continue;
    const intro = collapse(textContent(s.nodes.filter((n) => n.type === "element" && n.tag === "p").slice(0, 1)));
    out.push(`### ${s.title}`, "", intro, "", codeList(s.nodes).map(code).join(" "), "");
  }
  out.push("## Roles", "");
  out.push(
    mdTable(
      ["Role", "Summary"],
      definitions(section(roles, "roles_defined_on_mdn")?.nodes ?? []).map((d) => [code(cleanAriaName(d.name)), d.brief]),
    ),
    "",
    "## State & property categories",
    "",
  );
  for (const s of attrs.sections) {
    if (!/_attributes$/.test(s.id) || s.id === "aria_attribute_types") continue;
    out.push(`- **${s.title}:** ${codeList(s.nodes).map(code).join(" ")}`);
  }
  out.push(
    "",
    "## States & properties",
    "",
    mdTable(
      ["Attribute", "Summary"],
      definitions(section(attrs, "index_of_states_and_properties")?.nodes ?? []).map((d) => [code(cleanAriaName(d.name)), d.brief]),
    ),
    "",
  );
  await writeFile(join(REFERENCES_DIR, "aria-index.md"), `${out.join("\n").trim()}\n`);
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { refresh: { type: "boolean" }, offline: { type: "boolean" } } });
  const opts: CachedFetchOptions = { refresh: values.refresh, offline: values.offline };
  await mkdir(REFERENCES_DIR, { recursive: true });
  const items = await collectElements(opts);
  await Promise.all([
    writeElements(items),
    writeContentCategories(items, opts),
    writeGlobalAttributes(opts),
    writeAriaIndex(items, opts),
  ]);
  log("done →", REFERENCES_DIR);
}

await main();
