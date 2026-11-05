# semantic-html-skill

A Claude Code / opencode **skill** for semantic, accessible HTML5 and modern
CSS, done the *HTML/CSS-over-JS(X)* way. It ships three things:

1. **A reference digest** (`references/`), partly generated from live MDN:
   every HTML element with its technical summary and attributes, the full
   *Content categories* guide plus an element × category matrix, the ARIA
   index and global attributes. Curated guides cover the decision rules,
   ARIA, native-over-JS, modern CSS (layers, nesting, tokens), CSS-first
   motion, design-system concepts (after the
   [Semantic Nodes style guide](https://semantic-nodes.vercel.app/style-guide/)),
   forms and accessibility.
2. **Templates** (`templates/`): validated HTML for the common cases, a
   layered CSS reference implementation, and React/JSX components.
3. **An MDN lookup** (`src/`) in TypeScript with **zero runtime
   dependencies**: a CLI and a dual-era MCP stdio server (`mdn-search`). It
   reads MDN's rendered page JSON directly, so there is no git clone, no
   Python and no vector DB. BM25 full-text search is the default; hybrid
   semantic search with reranking is optional.

## Requirements

- Node **≥ 22.18**, which runs `.ts` natively with no build step. Bun works
  too.
- No `npm install` is needed for the CLI, the MCP server or the references.
  `npm install` only adds the dev tools (typecheck, html-validate) and the
  optional embedding package.

## Install

```bash
# put the folder in your skills dir, e.g.
git clone <this repo> ~/.claude/skills/semantic-html
claude mcp add mdn-search -- node ~/.claude/skills/semantic-html/src/mcp/server.ts
```

opencode (`opencode.json`):

```jsonc
"mcp": {
  "mdn-search": { "type": "local", "command": ["node", "/abs/path/semantic-html/src/mcp/server.ts"] }
}
```

On first start the server builds the search index in the background. That
takes about 2 minutes and ~1,760 page fetches, all cached under
`~/.cache/semantic-html`.

## CLI

```bash
node src/cli.ts element dialog            # technical summary + attributes
node src/cli.ts element search --full     # + description / usage / accessibility sections
node src/cli.ts search "accessible name for icon button" -k 8
node src/cli.ts search "animate height auto" --prefix Web/CSS
node src/cli.ts page Web/CSS/Reference/At-rules/@starting-style -s examples
node src/cli.ts title ":has()"
node src/cli.ts index [--embed] [--refresh] [--scope Web/HTML --scope Web/API]
node src/cli.ts status
# add --json to any command for structured output
```

### Optional: semantic search + 3D viewer

```bash
npm install                                # pulls the optional @huggingface/transformers
node src/cli.ts index --embed              # ~15k chunks → int8 vectors (local ONNX MiniLM)
node src/cli.ts search "how do I make a modal accessible"   # hybrid BM25+vector, RRF, cross-encoder rerank
npm run viewer                             # http://localhost:7341, the 3D synapse navigator
```

## MCP server

`src/mcp/server.ts` speaks newline-delimited JSON-RPC on stdio, written by
hand with no SDK. It is **dual-era**:

- **Modern** clients (MCP `2026-07-28`) send a per-request
  `_meta["io.modelcontextprotocol/protocolVersion"]` and can call
  `server/discover`. Results carry `resultType: "complete"`. An unsupported
  version gets error `-32022` with the list of supported versions.
- **Legacy** clients (`2025-11-25` … `2024-11-05`) use the `initialize`
  handshake.

| Tool | Purpose |
| --- | --- |
| `search_mdn` | ranked MDN section chunks (BM25, or hybrid + rerank) |
| `get_element` | an element's technical summary, attributes and Baseline status |
| `get_mdn_page` | any MDN page, or selected sections, as Markdown |
| `lookup_mdn_title` | fuzzy title lookup over all ~15k MDN pages |
| `index_status` / `reindex_mdn` | index state, background rebuild |

Set `SEMANTIC_HTML_NO_AUTOINDEX=1` to turn off the first-run background build.

## Configuration (env)

| Variable | Default | |
| --- | --- | --- |
| `SEMANTIC_HTML_CACHE` | `~/.cache/semantic-html` | page cache, indexes, status |
| `SEMANTIC_HTML_SCOPE` | `Web/HTML,Web/Accessibility,Web/CSS,Learn…/Structuring_content,Learn…/Accessibility` | indexed slug prefixes |
| `SEMANTIC_HTML_TTL_DAYS` | `14` | age at which cached pages are revalidated (ETag) |
| `SEMANTIC_HTML_CONCURRENCY` | `8` | parallel fetches |
| `SEMANTIC_HTML_EMBED` | unset | `1` makes `index` build embeddings by default |
| `SEMANTIC_HTML_EMBED_MODEL` / `_RERANK_MODEL` | `Xenova/all-MiniLM-L6-v2` / `Xenova/ms-marco-MiniLM-L-6-v2` | |
| `PORT` | `7341` | viewer |

## Development

```bash
npm install
npm run check            # tsc (TS 7) + node:test + html-validate on templates
npm run build:refs       # regenerate the generated references from MDN
```

## Layout

```
SKILL.md                       skill entrypoint
references/
  rules.md aria.md native-over-js.md css.md motion.md design-system.md forms.md accessibility.md   (curated)
  elements/ content-categories.md global-attributes.md aria-index.md                               (generated)
templates/
  *.html                       validated page and pattern templates
  styles/                      main.css → reset · tokens · base · layout · components · utilities (one per @layer)
  jsx/                         Button · Dialog · Disclosure · Field · Card
src/
  config.ts                    paths, env, scope, tunables
  md.ts                        markdown builders
  html/                        parse.ts (tolerant HTML tree) · to-markdown.ts · tables.ts
  mdn/                         fetch.ts (disk cache, ETag, retry, pool) · page.ts (index.json → Page) · title-index.ts
  search/                      chunk.ts · bm25.ts (BM25F) · embed.ts (optional) · vectors.ts (int8 + PCA) · engine.ts (hybrid, RRF)
  status.ts                    shared build status (pid-aware)
  lookup.ts                    façade used by CLI + MCP
  cli.ts                       `mdn` CLI
  mcp/                         server.ts (dual-era stdio) · tools.ts
  viewer/                      server.ts + viewer.html (3D synapse navigator)
  build-references.ts          generates references/ from MDN
test/                          node:test suites
```

```text
  MDN ──(index.json, search-index.json)──▶ mdn/fetch (cache) ──▶ mdn/page ──┬─▶ build-references ─▶ references/*.md
                                                                          ├─▶ search/chunk ─▶ bm25 (+ embed/vectors)
                                                                          │                       │
                                       CLI (cli.ts) ◀── lookup.ts ◀───────┴─── engine.search ◀────┘
                                       MCP (mcp/)  ◀──┘                         viewer/server ◀── vectors + PCA
```

Content from MDN Web Docs (<https://developer.mozilla.org>) is © Mozilla
Contributors under CC-BY-SA 2.5. The generated references link back to their
source pages.
