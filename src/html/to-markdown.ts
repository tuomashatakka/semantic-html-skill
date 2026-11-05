/**
 * Render MDN prose HTML as compact Markdown. Handles the subset MDN emits:
 * headings, paragraphs, inline code, code examples, lists, definition
 * lists, tables, notecards, status icons and links.
 */
import { MDN } from "../config.ts";
import { type ElementNode, type HtmlNode, children, collapse, hasClass, parseHtml, textContent } from "./parse.ts";
import { tableRows } from "./tables.ts";

export interface MarkdownOptions {
  /** Keep links as `[text](url)`; otherwise render just the text. */
  links?: boolean;
  /** Base for resolving relative hrefs. */
  base?: string;
}

const STATUS_ICON: Record<string, string> = {
  "icon-deprecated": "deprecated",
  "icon-experimental": "experimental",
  "icon-nonstandard": "non-standard",
};

export function absoluteUrl(href: string, base: string = MDN.origin): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Status tags carried by MDN's inline icons (`<span class="icon icon-…">`). */
export function statusIcons(nodes: readonly HtmlNode[]): string[] {
  const tags = new Set<string>();
  const walk = (list: readonly HtmlNode[]) => {
    for (const n of list) {
      if (n.type !== "element") continue;
      if (n.tag === "span" && hasClass(n, "icon")) {
        const cls = (n.attrs.class ?? "").split(/\s+/);
        for (const c of cls) if (STATUS_ICON[c]) tags.add(STATUS_ICON[c]);
        if (cls.includes("discouraged")) tags.add("deprecated");
        if (cls.includes("icon-limited")) tags.add("limited-availability");
      }
      walk(n.children);
    }
  };
  walk(nodes);
  return [...tags];
}

const fence = (code: string) => (code.includes("```") ? "~~~~" : "```");

class Renderer {
  private readonly opts: { links: boolean; base: string };
  constructor(opts: MarkdownOptions) {
    this.opts = { links: opts.links ?? true, base: opts.base ?? MDN.origin };
  }

  inline(nodes: readonly HtmlNode[]): string {
    let out = "";
    for (const n of nodes) out += n.type === "text" ? n.text.replace(/\s+/g, " ") : this.inlineEl(n);
    return out;
  }

  private inlineEl(n: ElementNode): string {
    const inner = () => this.inline(n.children);
    switch (n.tag) {
      case "code":
      case "kbd":
      case "samp": {
        const t = collapse(textContent(n));
        return t ? (t.includes("`") ? `\`\` ${t} \`\`` : `\`${t}\``) : "";
      }
      case "strong":
      case "b": {
        const t = inner().trim();
        return t ? `**${t}**` : "";
      }
      case "em":
      case "i": {
        const t = inner().trim();
        return t ? `_${t}_` : "";
      }
      case "a": {
        const t = inner();
        const href = n.attrs.href;
        if (!this.opts.links || !href || href.startsWith("#") || !t.trim()) return t;
        return `[${t.trim()}](${absoluteUrl(href, this.opts.base)})`;
      }
      case "br":
        return "  \n";
      case "img":
        return n.attrs.alt ? `[image: ${n.attrs.alt}]` : "";
      case "span": {
        const tags = hasClass(n, "icon") ? statusIcons([n]) : [];
        if (tags.length) return ` _(${tags.join(", ")})_`;
        return inner();
      }
      case "sup":
      case "sub":
      case "abbr":
      case "mark":
      case "q":
      case "var":
      case "dfn":
      case "small":
      case "time":
      case "data":
      case "s":
      case "del":
      case "ins":
      case "u":
      case "cite":
        return inner();
      case "script":
      case "style":
      case "svg":
      case "iframe":
      case "button":
        return "";
      case "ul":
      case "ol":
        return ` ${children(n, "li").map((li) => collapse(this.inline(li.children))).filter(Boolean).join(", ")} `;
      case "p":
        return ` ${inner()} `;
      default:
        return this.isBlock(n) ? ` ${collapse(this.block([n]))} ` : inner();
    }
  }

  private isBlock(n: ElementNode): boolean {
    return /^(p|div|ul|ol|dl|table|pre|h[1-6]|figure|blockquote|section|details)$/.test(n.tag);
  }

  block(nodes: readonly HtmlNode[]): string {
    const parts: string[] = [];
    let inlineRun: HtmlNode[] = [];
    const flush = () => {
      const t = collapse(this.inline(inlineRun));
      if (t) parts.push(t);
      inlineRun = [];
    };
    for (const n of nodes) {
      if (n.type === "element" && this.isBlock(n)) {
        flush();
        const b = this.blockEl(n);
        if (b.trim()) parts.push(b);
      } else if (n.type === "element" && /^(script|style|iframe|svg)$/.test(n.tag)) {
        continue;
      } else {
        inlineRun.push(n);
      }
    }
    flush();
    return parts.join("\n\n");
  }

  private blockEl(n: ElementNode): string {
    switch (n.tag) {
      case "p":
        return collapse(this.inline(n.children));
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const title = collapse(this.inline(n.children));
        // Live-sample "Result" headings precede an iframe we can't render.
        if (/^result$/i.test(title)) return "";
        return `${"#".repeat(Number(n.tag[1]))} ${title}`;
      }
      case "pre": {
        const code = textContent(n).replace(/\n+$/, "");
        const lang = /brush:\s*([\w-]+)/.exec(n.attrs.class ?? "")?.[1] ?? "";
        const f = fence(code);
        return `${f}${lang}\n${code}\n${f}`;
      }
      case "ul":
      case "ol":
        return this.list(n);
      case "dl":
        return this.dl(n);
      case "table":
        return this.table(n);
      case "blockquote":
        return prefixLines(this.block(n.children), "> ");
      case "div": {
        if (hasClass(n, "example-header")) return "";
        if (hasClass(n, "notecard")) return prefixLines(this.block(n.children), "> ");
        return this.block(n.children);
      }
      default:
        return this.block(n.children);
    }
  }

  private list(n: ElementNode): string {
    const ordered = n.tag === "ol";
    return children(n, "li")
      .map((li, i) => {
        const marker = ordered ? `${i + 1}.` : "-";
        const pad = " ".repeat(marker.length + 1);
        // Tight lists: no blank line before a nested list.
        const body = this.block(li.children).replace(/\n\n(?=(?:[-*]|\d+\.) )/g, "\n");
        return `${marker} ${body
          .split("\n")
          .map((l, j) => (j === 0 || !l ? l : pad + l))
          .join("\n")}`;
      })
      .join("\n");
  }

  private dl(n: ElementNode): string {
    const out: string[] = [];
    for (const c of children(n)) {
      if (c.tag === "dt") out.push(`- **${collapse(this.inline(c.children)).replace(/^\*\*|\*\*$/g, "")}**`);
      else if (c.tag === "dd") {
        out.push(prefixLines(this.block(c.children), "  "));
      }
    }
    return out.join("\n");
  }

  private table(n: ElementNode): string {
    const rows = tableRows(n).map((cells) => cells.map((c) => collapse(this.inline(c.children)).replace(/\|/g, "\\|")));
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
    const [head = [], ...body] = rows.map(pad);
    return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join(
      "\n",
    );
  }
}

const prefixLines = (s: string, p: string) =>
  s
    .split("\n")
    .map((l) => (l ? p + l : p.trimEnd()))
    .join("\n");

export function nodesToMarkdown(nodes: readonly HtmlNode[], opts: MarkdownOptions = {}): string {
  return new Renderer(opts).block(nodes).replace(/\n{3,}/g, "\n\n").trim();
}

export function nodesToInline(nodes: readonly HtmlNode[], opts: MarkdownOptions = {}): string {
  return collapse(new Renderer(opts).inline(nodes));
}

export function htmlToMarkdown(html: string, opts: MarkdownOptions = {}): string {
  return nodesToMarkdown(parseHtml(html), opts);
}

