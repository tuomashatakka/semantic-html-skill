#!/usr/bin/env python3
"""
viewer_server.py — serves vector-viewer.html plus a tiny JSON API exposing
the live zvec index for the 3D synapse navigator.

    .venv/bin/python scripts/viewer_server.py          # http://localhost:7341
    PORT=8080 .venv/bin/python scripts/viewer_server.py

Endpoints:
    GET /                      the viewer
    GET /api/status            live index status (doc_count, ingest progress)
    GET /api/graph?n=400&k=3   sampled real nodes + knn synapse links
                               (positions = PCA of the actual embeddings)
    GET /api/search?q=...      reranked semantic search; hits carry graph ids
                               and PCA coords so new nodes can be spliced in
"""

import json
import os
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

import mdn_rag
import zvec

PORT = int(os.environ.get("PORT", "7341"))
HTML_PATH = mdn_rag.SKILL_DIR / "vector-viewer.html"

# ---------------------------------------------------------------------------
# Graph state (PCA basis cached so search hits project into the same space)
# ---------------------------------------------------------------------------
_state_lock = threading.Lock()
_graph = {
    "ids": [],            # doc id -> graph index (ordered list)
    "id_to_idx": {},
    "vecs": None,         # (N, 384) float32
    "mean": None,
    "comps": None,        # (3, 384)
    "scale": 1.0,
}


def _collection():
    return mdn_rag.open_index()


def _sample_docs(n=400, probes=8):
    """Spread sampling across semantic space: probe with random unit vectors
    and take topk per probe, then dedupe. Falls back to a plain scan."""
    c = _collection()
    per = max(8, n // probes)
    seen = {}
    rng = np.random.default_rng()
    for _ in range(probes):
        v = rng.normal(size=mdn_rag.EMBED_DIM).astype(np.float32)
        v /= np.linalg.norm(v)
        hits = c.query(
            vectors=zvec.VectorQuery("embedding", vector=v.tolist()),
            topk=per,
            include_vector=True,
            output_fields=["path", "title", "chunk"],
        )
        for h in hits:
            if h.id not in seen:
                seen[h.id] = h
        if len(seen) >= n:
            break
    docs = list(seen.values())[:n]
    return docs


def build_graph(n=400, k=3):
    docs = _sample_docs(n)
    vecs = np.array([d.vector("embedding") for d in docs], dtype=np.float32)

    # PCA -> 3D from the real embeddings
    mean = vecs.mean(axis=0)
    centered = vecs - mean
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    comps = vt[:3]
    pos = centered @ comps.T
    scale = 6.0 / max(1e-6, float(np.abs(pos).max()))
    pos *= scale

    # knn synapses from real cosine similarity (vectors are normalized)
    sims = vecs @ vecs.T
    np.fill_diagonal(sims, -2.0)
    nn = np.argpartition(-sims, kth=k, axis=1)[:, :k]
    links, seen = [], set()
    for i in range(len(docs)):
        for j in nn[i]:
            j = int(j)
            key = (min(i, j), max(i, j))
            if key not in seen:
                seen.add(key)
                links.append([key[0], key[1], round(float(sims[i, j]), 4)])

    nodes = []
    for i, d in enumerate(docs):
        rel = d.field("path") or ""
        nodes.append(
            {
                "id": d.id,
                "title": d.field("title") or rel,
                "path": rel,
                "url": mdn_rag.mdn_url_for(rel),
                "chunk": d.field("chunk") or 0,
                "p": [round(float(x), 4) for x in pos[i]],
            }
        )

    with _state_lock:
        _graph["ids"] = [d.id for d in docs]
        _graph["id_to_idx"] = {d.id: i for i, d in enumerate(docs)}
        _graph["vecs"] = vecs
        _graph["mean"] = mean
        _graph["comps"] = comps
        _graph["scale"] = scale

    return {"nodes": nodes, "links": links, "k": k}


def project(vec):
    with _state_lock:
        if _graph["mean"] is None:
            return [0.0, 0.0, 0.0]
        p = (np.asarray(vec, dtype=np.float32) - _graph["mean"]) @ _graph["comps"].T
        p = p * _graph["scale"]
    return [round(float(x), 4) for x in p]


def search(q, topk=8, fetch_k=24):
    c = _collection()
    has_text = mdn_rag.index_has_text_field(c)
    emb = mdn_rag.get_embedder().encode(q, normalize_embeddings=True).tolist()
    fields = ["path", "title", "chunk"] + (["text"] if has_text else [])
    hits = c.query(
        vectors=zvec.VectorQuery("embedding", vector=emb),
        topk=fetch_k,
        include_vector=True,
        output_fields=fields,
    )

    items = []
    for h in hits:
        rel = h.field("path") or ""
        ci = h.field("chunk") or 0
        text = (
            h.field("text") if has_text else mdn_rag.chunk_text_from_disk(rel, ci)
        ) or ""
        items.append(
            {
                "id": h.id,
                "title": h.field("title") or rel,
                "path": rel,
                "url": mdn_rag.mdn_url_for(rel),
                "chunk": ci,
                "vector_score": float(h.score),
                "snippet": " ".join(text.split())[:220],
                "_vec": h.vector("embedding"),
                "_text": text,
            }
        )

    ce = mdn_rag.get_reranker()
    scores = ce.predict([(q, (it["_text"] or it["title"])[:2000]) for it in items])
    for it, s in zip(items, scores):
        it["rerank_score"] = round(float(s), 4)
    items.sort(key=lambda r: r["rerank_score"], reverse=True)
    items = items[:topk]

    with _state_lock:
        id_to_idx = dict(_graph["id_to_idx"])
        gvecs = _graph["vecs"]

    out = []
    for it in items:
        entry = {kk: vv for kk, vv in it.items() if not kk.startswith("_")}
        if it["id"] in id_to_idx:
            entry["graph_index"] = id_to_idx[it["id"]]
        else:
            # splice-in payload: PCA coords + nearest sampled neighbours
            entry["p"] = project(it["_vec"])
            if gvecs is not None:
                sims = gvecs @ np.asarray(it["_vec"], dtype=np.float32)
                order = np.argsort(-sims)[:3]
                entry["attach"] = [
                    [int(i), round(float(sims[i]), 4)] for i in order
                ]
        out.append(entry)
    return {"query": q, "results": out}


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        # allow the viewer to run from file:// or another local origin
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        try:
            if parsed.path in ("/", "/index.html"):
                body = HTML_PATH.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif parsed.path == "/api/status":
                self._json(mdn_rag.status())
            elif parsed.path == "/api/graph":
                n = min(1200, max(50, int(qs.get("n", ["400"])[0])))
                k = min(6, max(1, int(qs.get("k", ["3"])[0])))
                self._json(build_graph(n=n, k=k))
            elif parsed.path == "/api/search":
                q = (qs.get("q", [""])[0]).strip()
                if not q:
                    self._json({"error": "empty query"}, 400)
                else:
                    self._json(search(q))
            else:
                self._json({"error": "not found"}, 404)
        except BrokenPipeError:
            pass
        except Exception as e:
            try:
                self._json({"error": str(e)}, 500)
            except Exception:
                pass


def main():
    mdn_rag.ensure_index_async()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"synapse viewer  →  http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
