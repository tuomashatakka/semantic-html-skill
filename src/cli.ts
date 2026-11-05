#!/usr/bin/env node
/**
 * mdn — offline-first MDN lookup for the semantic-html skill.
 *
 *   node src/cli.ts search "accessible name for icon button" [-k 8] [--prefix Web/CSS] [--full] [--json]
 *   node src/cli.ts element dialog [--full]
 *   node src/cli.ts page Web/HTML/Reference/Elements/dialog [-s accessibility -s examples]
 *   node src/cli.ts title popover
 *   node src/cli.ts index [--embed] [--refresh] [--scope Web/HTML --scope Web/CSS]
 *   node src/cli.ts status
 */
import { parseArgs } from "node:util";
import { buildIndex } from "./search/engine.ts";
import * as lookup from "./lookup.ts";

const HELP = `mdn <command> [args]

commands:
  search <query>     full-text (BM25, or hybrid + rerank when embeddings are built)
  element <name>     element technical summary + attributes (live page, cached)
  page <slug|url|q>  render an MDN page (or chosen sections) as Markdown
  title <query>      fuzzy title lookup across all ~15k MDN pages
  index              build/refresh the search index
  status             index + cache status

options:
  -k, --topk <n>     results for search (default 5)
  -s, --section <s>  page sections to include (repeatable)
      --prefix <p>   restrict search to a slug prefix (e.g. Web/CSS)
      --scope <p>    index scope prefixes (repeatable)
      --embed        also build the embedding index (needs @huggingface/transformers)
      --mode <m>     auto | bm25 | hybrid
      --no-rerank    skip cross-encoder rerank
      --refresh      revalidate cached pages
      --full         include full chunk/page text
      --json         print structured JSON instead of Markdown`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    topk: { type: "string", short: "k" },
    section: { type: "string", short: "s", multiple: true },
    prefix: { type: "string" },
    scope: { type: "string", multiple: true },
    embed: { type: "boolean" },
    mode: { type: "string" },
    rerank: { type: "boolean" },
    refresh: { type: "boolean" },
    full: { type: "boolean" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [cmd, ...rest] = positionals;
const arg = rest.join(" ");

const print = (r: lookup.Rendered<unknown>) => console.log(values.json ? JSON.stringify(r.data, null, 2) : r.markdown);

function need(what: string): string {
  if (!arg) {
    console.error(`usage: mdn ${cmd} <${what}>`);
    process.exit(2);
  }
  return arg;
}

async function main(): Promise<void> {
  switch (cmd) {
    case "search":
      return print(
        await lookup.searchDocs(need("query"), {
          topk: values.topk ? Number(values.topk) : undefined,
          prefix: values.prefix,
          rerank: values.rerank,
          mode: values.mode as "auto" | "bm25" | "hybrid" | undefined,
          full: values.full,
        }),
      );
    case "element":
      return print(await lookup.element(need("name"), { full: values.full }));
    case "page":
      return print(await lookup.page(need("slug|url|query"), values.section));
    case "title":
      return print(await lookup.titles(need("query"), values.topk ? Number(values.topk) : 10));
    case "index":
      await buildIndex({ scope: values.scope, embed: values.embed, refresh: values.refresh, onProgress: (m) => console.error(m) });
      return print(await lookup.status());
    case "status":
      return print(await lookup.status());
    default:
      console.log(HELP);
      if (cmd && !values.help) process.exitCode = 2;
  }
}

main().catch((err: Error) => {
  console.error(`mdn: ${err.message}`);
  process.exit(1);
});
