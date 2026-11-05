/**
 * Minimal, forgiving HTML → tree parser for MDN's rendered prose.
 * Not a spec parser: it handles well-formed-ish markup, void elements,
 * raw-text elements and implicit closes by popping to the nearest match.
 */

export interface ElementNode {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}
export interface TextNode {
  type: "text";
  text: string;
}
export type HtmlNode = ElementNode | TextNode;

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const RAW_TEXT = new Set(["script", "style"]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©",
  reg: "®", trade: "™", times: "×", rarr: "→", larr: "←", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of src.matchAll(ATTR_RE)) {
    const name = m[1];
    if (!name) continue;
    attrs[name.toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

const TOKEN_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!doctype[^>]*>|<\/?([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

export function parseHtml(html: string): HtmlNode[] {
  const root: ElementNode = { type: "element", tag: "#root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const top = () => stack[stack.length - 1] as ElementNode;
  const pushText = (t: string) => {
    if (t) top().children.push({ type: "text", text: decodeEntities(t) });
  };

  let last = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(html); m; m = TOKEN_RE.exec(html)) {
    pushText(html.slice(last, m.index));
    last = TOKEN_RE.lastIndex;
    const raw = m[0];
    const tag = m[1]?.toLowerCase();
    if (!tag) continue; // comment / doctype / cdata

    if (raw[1] === "/") {
      const idx = stack.findLastIndex((n) => n.tag === tag);
      if (idx > 0) stack.length = idx;
      continue;
    }

    const node: ElementNode = { type: "element", tag, attrs: parseAttrs(m[2] ?? ""), children: [] };
    top().children.push(node);
    if (VOID.has(tag) || raw.endsWith("/>")) continue;

    if (RAW_TEXT.has(tag)) {
      const close = html.toLowerCase().indexOf(`</${tag}`, last);
      const end = close === -1 ? html.length : close;
      node.children.push({ type: "text", text: html.slice(last, end) });
      const gt = close === -1 ? html.length : html.indexOf(">", close) + 1;
      last = TOKEN_RE.lastIndex = gt;
      continue;
    }
    stack.push(node);
  }
  pushText(html.slice(last));
  return root.children;
}

// --- tree helpers ---------------------------------------------------------

export const isEl = (n: HtmlNode | undefined, tag?: string): n is ElementNode =>
  n?.type === "element" && (tag === undefined || n.tag === tag);

export const hasClass = (n: ElementNode, cls: string) => (n.attrs.class ?? "").split(/\s+/).includes(cls);

export function textContent(nodes: readonly HtmlNode[] | HtmlNode): string {
  const list = Array.isArray(nodes) ? nodes : [nodes as HtmlNode];
  let out = "";
  for (const n of list) out += n.type === "text" ? n.text : textContent(n.children);
  return out;
}

export function children(n: ElementNode, tag?: string): ElementNode[] {
  return n.children.filter((c): c is ElementNode => isEl(c, tag));
}

/** Depth-first search for all elements matching `pred`. */
export function findAll(nodes: readonly HtmlNode[], pred: (n: ElementNode) => boolean): ElementNode[] {
  const out: ElementNode[] = [];
  const walk = (list: readonly HtmlNode[]) => {
    for (const n of list) {
      if (n.type !== "element") continue;
      if (pred(n)) out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export const findFirst = (nodes: readonly HtmlNode[], pred: (n: ElementNode) => boolean) => findAll(nodes, pred)[0];

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
