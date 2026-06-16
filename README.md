# semantic-html-skill

A Claude / opencode **skill** that enforces semantic, accessible, reusable
HTML5 + CSS — backed by a digested MDN reference that ships with the skill and a
local MDN semantic-search index (zvec + sentence-transformers, exposed as the
`mdn-search` MCP server).

Two halves:

1. **Digested reference (`references/`)** — works offline, no index or server.
   Covers the everyday decisions.
   - `patterns.md` — decision procedure + anti-pattern → fix table (the enforcement core)
   - `elements.md` — all 128 HTML elements grouped by semantic function, deprecated ones flagged
   - `content-model.md` — the seven content categories (what nests in what)
   - `aria.md` — rules of ARIA, landmark → implicit-role map, role/state index
2. **Live MDN index** — reranked semantic search over the full MDN reference
   (HTML/CSS/JS/SVG/ARIA/HTTP/security) for deep lookups, via the `mdn-search`
   MCP server or the `ingest_mdn.py` CLI.

## Install

Drop the folder into your skills directory (`~/.claude/skills/semantic-html`
for Claude Code, or your opencode skills path), then build the local env + index:

```bash
bash scripts/setup.sh           # venv + deps + first MDN ingest (~200MB clone)
```

## Use the live index

```bash
# Register the MCP server (Claude Code)
claude mcp add mdn-search -- \
  "$PWD/.venv/bin/python" "$PWD/scripts/mcp_server.py"

# Or query from the CLI
.venv/bin/python scripts/ingest_mdn.py --query "when to use <dialog> vs role=dialog"
.venv/bin/python scripts/ingest_mdn.py --status
.venv/bin/python scripts/ingest_mdn.py --reindex      # rebuild + refresh clone
```

For Claude Desktop, add an `mdn-search` entry to `mcpServers` in
`claude_desktop_config.json` pointing at the same `.venv/bin/python` +
`scripts/mcp_server.py`.

## Regenerate the digest

The `references/*.md` files (except the hand-curated `patterns.md`) are derived
from the `mdn_content` clone. After a `--reindex`, rebuild them:

```bash
.venv/bin/python scripts/build_references.py
```

`build_references.py` is pure stdlib, so the offline reference stays rebuildable
even if the RAG env breaks.

## Layout

```
SKILL.md                 skill entrypoint (frontmatter + workflow)
references/              digested, offline, macro-free MDN reference
scripts/
  build_references.py    digest extractor (MDN clone -> references/)
  mdn_rag.py             core RAG library (chunk, ingest, reranked search)
  mcp_server.py          mdn-search MCP stdio server (auto-populates)
  ingest_mdn.py          CLI over mdn_rag (--query / --reindex / --status)
  viewer_server.py       3D synapse viewer server
  mdn-query.py           open MDN + GitHub search in a browser
  setup.sh               one-command env setup
  requirements.txt       zvec, sentence-transformers, mcp
vector-viewer.html       3D embedding navigator (served by viewer_server.py)
```

Reference: <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference>
