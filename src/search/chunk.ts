/** Split a Page into search chunks along section boundaries. */
import { SEARCH } from "../config.ts";
import { nodesToMarkdown } from "../html/to-markdown.ts";
import type { Page } from "../mdn/page.ts";

export interface Chunk {
  /** `<slug>#<section-id>[~n]` — stable across rebuilds. */
  id: string;
  slug: string;
  url: string;
  title: string;
  /** Heading path inside the page ("Accessibility › Skip links"). */
  heading: string;
  text: string;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n{2,}/)) {
    if (buf && buf.length + para.length + 2 > max) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${para}` : para;
    while (buf.length > max * 1.5) {
      out.push(buf.slice(0, max));
      buf = buf.slice(max);
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function chunkPage(page: Page): Chunk[] {
  const chunks: Chunk[] = [];
  let parent = "";
  for (const s of page.sections) {
    if (s.id === "see_also" || s.id === "specifications" || s.id === "browser_compatibility") continue;
    if (s.level === 2) parent = s.id === "intro" ? "" : s.title;
    const heading = s.level === 3 && parent ? `${parent} › ${s.title}` : s.id === "intro" ? "" : s.title;
    let text = nodesToMarkdown(s.nodes, { links: false });
    if (s.id === "intro" && page.summary && !text.includes(page.summary.slice(0, 40))) text = `${page.summary}\n\n${text}`;
    if (text.length < SEARCH.chunkMinChars && s.id !== "intro") continue;
    splitLong(text, SEARCH.chunkMaxChars).forEach((part, i) => {
      chunks.push({
        id: `${page.slug}#${s.id}${i ? `~${i}` : ""}`,
        slug: page.slug,
        url: s.id === "intro" ? page.url : `${page.url}#${s.id}`,
        title: page.title,
        heading,
        text: part,
      });
    });
  }
  return chunks;
}
