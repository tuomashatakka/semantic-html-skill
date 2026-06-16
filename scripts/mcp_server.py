#!/usr/bin/env python3
"""
mcp_server.py — MDN semantic search as an MCP server (stdio).

Auto-populates the vector index on startup if missing (background thread),
serves reranked semantic search over the MDN web reference.

Register (Claude Code):
  claude mcp add mdn-search -- ~/.config/opencode/skills/semantic-html/.venv/bin/python \
      ~/.config/opencode/skills/semantic-html/scripts/mcp_server.py

Register (opencode, in opencode.json):
  "mcp": {
    "mdn-search": {
      "type": "local",
      "command": [
        "/Users/mia/.config/opencode/skills/semantic-html/.venv/bin/python",
        "/Users/mia/.config/opencode/skills/semantic-html/scripts/mcp_server.py"
      ]
    }
  }
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mdn_rag
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("mdn-search")


@mcp.tool()
def search_mdn(query: str, topk: int = 5, rerank: bool = True) -> dict:
    """Semantic search over the MDN web reference (HTML, CSS, JS, SVG, ARIA,
    HTTP, security). Returns reranked chunks with content and live MDN URLs.
    Use for: semantic HTML element choice, accessibility/ARIA correctness,
    CSS-native solutions, web platform API details.

    Args:
        query: Natural-language question, e.g. "when to use <dialog> vs role=dialog"
        topk: Number of results to return (default 5)
        rerank: Apply cross-encoder reranking for precision (default True)
    """
    return mdn_rag.search(query, topk=topk, rerank=rerank)


@mcp.tool()
def index_status() -> dict:
    """Check the MDN vector index: ready / building (with progress) / missing.
    If the index is being auto-built on first run, this shows chunk progress."""
    return mdn_rag.status()


@mcp.tool()
def reindex_mdn() -> dict:
    """Rebuild the MDN index from scratch in the background (pulls latest
    mdn/content if the clone is missing). Takes a while; poll index_status."""
    import threading

    if mdn_rag.read_status().get("state") == "indexing":
        return {"started": False, "reason": "ingest already running"}
    threading.Thread(
        target=lambda: mdn_rag.reindex(progress=lambda *a, **k: None), daemon=True
    ).start()
    return {"started": True, "note": "rebuilding in background; poll index_status"}


if __name__ == "__main__":
    # Auto-populate: if no index exists, start building it in the background
    # so the server is immediately usable and search degrades gracefully.
    mdn_rag.ensure_index_async()
    mcp.run(transport="stdio")
