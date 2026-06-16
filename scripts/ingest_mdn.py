#!/usr/bin/env python3
"""
CLI for the MDN vector index. Logic lives in mdn_rag.py.

Usage:
    ./ingest_mdn.py                 # Build index if missing (auto-populate)
    ./ingest_mdn.py --query "..."   # Reranked semantic search
    ./ingest_mdn.py --query "..." --no-rerank
    ./ingest_mdn.py --reindex       # Clean rebuild
    ./ingest_mdn.py --status        # Index / ingest progress
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.stdout.reconfigure(line_buffering=True)

import mdn_rag


def main():
    args = sys.argv[1:]

    if "--status" in args:
        print(json.dumps(mdn_rag.status(), indent=2))
        return

    if "--query" in args:
        i = args.index("--query")
        q = args[i + 1] if i + 1 < len(args) else ""
        if not q:
            print("usage: ingest_mdn.py --query 'your question'")
            sys.exit(1)
        out = mdn_rag.search(q, topk=10, rerank="--no-rerank" not in args)
        if out.get("error"):
            print(out["error"])
            sys.exit(1)
        print(f"\nResults for: {q}  (reranked: {out['reranked']})\n")
        for n, r in enumerate(out["results"], 1):
            score = r.get("rerank_score", r["vector_score"])
            print(f"  {n}. [{score:.3f}] {r['title']}")
            print(f"     {r['url']}")
            snippet = " ".join((r.get("text") or "").split())[:160]
            if snippet:
                print(f"     {snippet}…")
            print()
        return

    if "--reindex" in args:
        mdn_rag.reindex()
        return

    # default: auto-populate (build only if missing)
    if mdn_rag.index_exists():
        print("Index already exists — nothing to do.")
        print("Use --reindex to rebuild, --query to search, --status to inspect.")
    else:
        mdn_rag.ingest()


if __name__ == "__main__":
    main()
