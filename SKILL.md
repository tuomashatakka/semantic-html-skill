---
name: semantic-html
description: |
  Enforce semantic, accessible, reusable HTML5 + CSS, backed by a digested MDN
  reference and a live MDN semantic-search index. Use whenever writing,
  reviewing, refactoring, or auditing HTML/CSS: choosing the right element,
  fixing div-soup, getting headings/landmarks/forms right, deciding native
  element vs ARIA, or replacing JS widgets with CSS-native ones. Prefers
  native HTML attributes (aria-, role-, data-*), WAI-ARIA done correctly, and
  CSS-native styling over JS DOM manipulation. Blocks non-semantic and
  deprecated markup. Reference: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference
---

# Semantic HTML

This skill makes HTML semantic, accessible, and clean — and keeps it that way
when reviewing or refactoring. It pairs two things:

1. **Digested MDN reference that ships with the skill** (`references/`) — works
   offline, no index or server needed. Covers the everyday decisions.
2. **A live MDN semantic-search index** (zvec + sentence-transformers, exposed
   as the `mdn-search` MCP server) for deep lookups the digest doesn't cover —
   exact attributes, a role's owned-element contract, browser-compat, CSS
   behavior.

Use the digest first; query the index when the digest doesn't answer it.

## What "semantic" means here (core rules)

- **Meaning before markup.** Choose the element whose name matches what the
  thing *is* (article, nav, button, list), not what it looks like. `<div>` and
  `<span>` are the last resort, never the default.
- **Respect the content model.** Elements have legal children (a `<p>` holds
  only phrasing content; a `<ul>` holds only `<li>`). Invalid nesting silently
  corrupts the accessibility tree. See `references/content-model.md`.
- **Native first, then ARIA.** The first rule of ARIA is *don't use ARIA* if a
  native element already has the semantics and behavior. No ARIA is better than
  bad ARIA. See `references/aria.md`.
- **CSS-native over JS.** Use `<details>`, `<dialog>`, popover, `:has()`,
  `:target`, container queries, etc. before wiring click handlers and state.
- **No deprecated/presentational markup.** No `<center>`, `<font>`, `<b>`/`<i>`
  for meaning, `<br>` for layout, `<table>` for layout, `<div onclick>`.
- **Keep it reusable and clean.** Lean DOM, meaningful class/`data-*` hooks,
  styling in CSS (`@layer`, nesting) rather than inline or JS.

## Bundled reference — read these first

Read the file that matches the task; they're plain markdown, macro-free,
regenerated from the MDN clone.

| File | Read it when you need to… |
| --- | --- |
| `references/patterns.md` | **Start here.** The decision procedure + an anti-pattern→fix table (block this, write that). The enforcement core. |
| `references/elements.md` | Pick an element — all 128 HTML elements grouped by semantic function, with deprecated/non-standard/experimental flags. |
| `references/content-model.md` | Check what may nest in what — the seven content categories + transparent model. |
| `references/aria.md` | Decide native-vs-ARIA, look up the landmark→implicit-role map, or scan available roles/states. |

For a quick read/review pass: skim `patterns.md`, fix what it flags, consult the
others for specifics.

## Deep lookups — the MDN semantic index

When the digest doesn't cover it, search the full MDN reference (HTML, CSS, JS,
SVG, ARIA, HTTP, security). Reranked semantic search returns the relevant chunk
text plus live MDN URLs.

### Preferred: the `mdn-search` MCP server

Tools: `search_mdn(query, topk, rerank)`, `index_status()`, `reindex_mdn()`.
The server auto-populates the index on first startup (background thread), so
first run is zero-touch. If `mdn-search` tools are available in the session,
prefer them over the CLI.

```bash
# Register once (Claude Code)
claude mcp add mdn-search -- \
  ~/.config/opencode/skills/semantic-html/.venv/bin/python \
  ~/.config/opencode/skills/semantic-html/scripts/mcp_server.py
```

```jsonc
// opencode.json
"mcp": {
  "mdn-search": {
    "type": "local",
    "command": [
      "/Users/mia/.config/opencode/skills/semantic-html/.venv/bin/python",
      "/Users/mia/.config/opencode/skills/semantic-html/scripts/mcp_server.py"
    ]
  }
}
```

### CLI fallback

```bash
cd ~/.config/opencode/skills/semantic-html
bash scripts/setup.sh                                   # venv + first ingest
.venv/bin/python scripts/ingest_mdn.py --query "when to use <dialog> vs role=dialog"
.venv/bin/python scripts/ingest_mdn.py --query "…" --no-rerank   # skip cross-encoder
.venv/bin/python scripts/ingest_mdn.py --status
.venv/bin/python scripts/ingest_mdn.py --reindex        # clean rebuild (refreshes the clone)
```

### Synapse viewer (3D)

```bash
.venv/bin/python scripts/viewer_server.py   # → http://localhost:7341
```

Live 3D navigator over the real index: PCA layout of actual embeddings, knn
synapse links, reranked search splicing new nodes into the graph. Arrow keys
traverse synapses, enter opens on MDN, drag orbits, pinch/wheel zooms.

## Regenerating the digest

The `references/*.md` files are derived from the same `mdn_content` clone the
index uses. After a `--reindex` (which refreshes the clone), rebuild them:

```bash
.venv/bin/python scripts/build_references.py
```

This regenerates `elements.md`, `content-model.md`, and `aria.md` from the
clone, and leaves the hand-curated `patterns.md` untouched.

## Tools

- `references/`: digested, offline, macro-free MDN reference (read these first).
- `scripts/build_references.py`: regenerate the digest from the MDN clone.
- `scripts/mdn_rag.py`: core RAG library — chunking, ingest, reranked search, status.
- `scripts/mcp_server.py`: MCP stdio server (`mdn-search`); auto-populates on startup.
- `scripts/ingest_mdn.py`: thin CLI over mdn_rag (`--query`, `--reindex`, `--status`).
- `scripts/viewer_server.py`: HTTP server for the 3D synapse viewer.
- `scripts/mdn-query.py`: open MDN + GitHub content search in a browser.
- `scripts/setup.sh`: one-command environment setup.
- `scripts/requirements.txt`: deps (`zvec`, `sentence-transformers`, `mcp`).

## Implementation notes (hard-won)

- zvec 0.4 has **no `commit()`** — persist with `collection.flush()` then
  `collection.optimize()`.
- `collection.stats` is a **property**, not a method.
- Embedding + rerank models are local sentence-transformers (no API keys, no
  daemons): `all-MiniLM-L6-v2` + `cross-encoder/ms-marco-MiniLM-L6-v2`. Override
  via `SEMANTIC_HTML_EMBED_MODEL` / `SEMANTIC_HTML_RERANK_MODEL`; data dir via
  `SEMANTIC_HTML_HOME`.
- The digest extractor is pure stdlib — it runs without the venv, so the
  offline reference is always rebuildable even if the RAG env breaks.
