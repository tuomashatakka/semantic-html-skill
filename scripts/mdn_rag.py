#!/usr/bin/env python3
"""
mdn_rag.py — core library for the semantic-html MDN vector index.

Embedding:  sentence-transformers all-MiniLM-L6-v2 (local, in-process)
Reranking:  sentence-transformers CrossEncoder ms-marco-MiniLM-L6-v2 (local)
Vector DB:  zvec (in-process, on-disk)

Works with both the legacy index (no stored text; text is reconstructed
from the mdn_content clone) and new indexes (text stored in the schema).
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

import zvec

# ---------------------------------------------------------------------------
# Config (env-overridable)
# ---------------------------------------------------------------------------
SKILL_DIR = Path(
    os.environ.get(
        "SEMANTIC_HTML_HOME",
        os.path.expanduser("~/.config/opencode/skills/semantic-html"),
    )
)
INDEX_PATH = str(SKILL_DIR / "mdn_index.zvec")
REPO_URL = "https://github.com/mdn/content.git"
REPO_DIR = SKILL_DIR / "mdn_content"
STATUS_FILE = SKILL_DIR / "ingest_status.json"

EMBED_MODEL = os.environ.get("SEMANTIC_HTML_EMBED_MODEL", "all-MiniLM-L6-v2")
RERANK_MODEL = os.environ.get(
    "SEMANTIC_HTML_RERANK_MODEL", "cross-encoder/ms-marco-MiniLM-L6-v2"
)
EMBED_DIM = 384
COLLECTION_NAME = "mdn_web_reference"
BATCH_SIZE = 64
EMBED_BATCH = 32

SECTIONS = [
    "web/html",
    "web/css",
    "web/javascript",
    "web/svg",
    "web/api",
    "web/accessibility",
    "web/performance",
    "web/guide",
    "web/http",
    "web/security",
    "Learn_web_development/Core/Structuring_content",
]

# Lazy singletons (model loads are slow; do them once per process)
_embedder = None
_reranker = None
_lock = threading.Lock()


def get_embedder():
    global _embedder
    with _lock:
        if _embedder is None:
            from sentence_transformers import SentenceTransformer

            _embedder = SentenceTransformer(EMBED_MODEL)
    return _embedder


def get_reranker():
    global _reranker
    with _lock:
        if _reranker is None:
            from sentence_transformers import CrossEncoder

            _reranker = CrossEncoder(RERANK_MODEL)
    return _reranker


# ---------------------------------------------------------------------------
# Chunking (deterministic — also used to reconstruct legacy-index text)
# ---------------------------------------------------------------------------
def chunk_markdown(text, min_chars=200, max_chars=1500):
    """Split an MDN page into chunks at heading boundaries."""
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL)
    if len(text.strip()) < min_chars:
        return []

    parts = re.split(r"(?=^#{1,3}\s)", text, flags=re.MULTILINE)
    chunks, buf = [], ""
    for part in parts:
        if not part.strip():
            continue
        if len(buf) + len(part) > max_chars and buf:
            chunks.append(buf.strip())
            buf = part
        else:
            buf += "\n" + part
    if buf.strip():
        chunks.append(buf.strip())

    final = []
    for c in chunks:
        if len(c) > max_chars:
            buf = ""
            for p in c.split("\n\n"):
                if len(buf) + len(p) > max_chars and buf:
                    final.append(buf.strip())
                    buf = p
                else:
                    buf += "\n\n" + p
            if buf.strip():
                final.append(buf.strip())
        else:
            final.append(c.strip())
    return [c for c in final if len(c) >= min_chars]


def chunk_text_from_disk(rel_path, chunk_index):
    """Reconstruct a chunk's text from the mdn_content clone (legacy indexes)."""
    full = REPO_DIR / "files" / "en-us" / rel_path
    try:
        content = full.read_text(encoding="utf-8")
    except Exception:
        return None
    chunks = chunk_markdown(content)
    if 0 <= chunk_index < len(chunks):
        return chunks[chunk_index]
    return None


def mdn_url_for(rel_path):
    """Map a repo-relative path to its live MDN URL."""
    slug = rel_path
    if slug.endswith("/index.md"):
        slug = slug[: -len("/index.md")]
    elif slug.endswith(".md"):
        slug = slug[: -len(".md")]
    return f"https://developer.mozilla.org/en-US/docs/{slug}"


# ---------------------------------------------------------------------------
# Status reporting (so the MCP server / CLI can watch background ingest)
# ---------------------------------------------------------------------------
def write_status(**kw):
    kw["updated_at"] = time.time()
    try:
        STATUS_FILE.write_text(json.dumps(kw))
    except Exception:
        pass


def read_status():
    try:
        return json.loads(STATUS_FILE.read_text())
    except Exception:
        return {"state": "unknown"}


# ---------------------------------------------------------------------------
# Index helpers
# ---------------------------------------------------------------------------
def index_exists():
    return os.path.exists(INDEX_PATH)


def open_index():
    return zvec.open(path=INDEX_PATH)


def index_has_text_field(collection):
    try:
        return any(f.name == "text" for f in collection.schema.fields)
    except Exception:
        return False


def doc_count(collection):
    try:
        return json.loads(str(collection.stats)).get("doc_count", 0)
    except Exception:
        return -1


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
def clone_repo():
    if REPO_DIR.exists():
        return False
    write_status(state="cloning", detail="git clone --depth 1 mdn/content")
    subprocess.run(
        ["git", "clone", "--depth", "1", REPO_URL, str(REPO_DIR)],
        check=True,
        capture_output=True,
    )
    return True


def collect_chunks():
    base_path = REPO_DIR / "files" / "en-us"
    pending = []
    total_files = 0
    for section in SECTIONS:
        target = base_path / section
        if not target.exists():
            continue
        for root, _, files in os.walk(target):
            for fn in files:
                if not fn.endswith(".md"):
                    continue
                full = Path(root) / fn
                rel = str(full.relative_to(base_path))
                try:
                    content = full.read_text(encoding="utf-8")
                except Exception:
                    continue
                m = re.search(r"^#{1,3}\s+(.+)$", content, re.MULTILINE)
                title = m.group(1).strip() if m else rel
                for i, chunk in enumerate(chunk_markdown(content)):
                    pending.append((chunk, rel, title, i))
                total_files += 1
    return pending, total_files


def ingest(progress=print):
    """Build (or rebuild) the index. Stores chunk text in the schema."""
    clone_repo()

    write_status(state="loading_model", detail=EMBED_MODEL)
    model = get_embedder()

    schema = zvec.CollectionSchema(
        name=COLLECTION_NAME,
        fields=[
            zvec.FieldSchema("source", zvec.DataType.STRING),
            zvec.FieldSchema("path", zvec.DataType.STRING),
            zvec.FieldSchema("title", zvec.DataType.STRING),
            zvec.FieldSchema("chunk", zvec.DataType.INT32),
            zvec.FieldSchema("text", zvec.DataType.STRING),
        ],
        vectors=zvec.VectorSchema("embedding", zvec.DataType.VECTOR_FP32, EMBED_DIM),
    )
    collection = zvec.create_and_open(path=INDEX_PATH, schema=schema)

    write_status(state="walking", detail="scanning mdn_content tree")
    pending, total_files = collect_chunks()
    progress(f"Found {total_files} files, {len(pending)} chunks")

    doc_batch = []
    total_indexed = 0

    def flush_inserts():
        nonlocal doc_batch, total_indexed
        if not doc_batch:
            return
        collection.insert(doc_batch)
        total_indexed += len(doc_batch)
        write_status(state="indexing", done=total_indexed, total=len(pending))
        try:
            progress(f"\r  Indexed {total_indexed} / {len(pending)} chunks...", end="")
        except TypeError:
            progress(f"  Indexed {total_indexed} / {len(pending)} chunks...")
        doc_batch = []

    for start in range(0, len(pending), EMBED_BATCH):
        batch = pending[start : start + EMBED_BATCH]
        embeddings = model.encode(
            [b[0] for b in batch], normalize_embeddings=True, show_progress_bar=False
        )
        for (text, rel, title, ci), emb in zip(batch, embeddings):
            doc_id = "mdn" + hashlib.sha256(f"{rel}\0{ci}".encode()).hexdigest()[:30]
            doc_batch.append(
                zvec.Doc(
                    id=doc_id,
                    vectors={"embedding": emb.tolist()},
                    fields={
                        "source": "mdn",
                        "path": rel,
                        "title": title,
                        "chunk": ci,
                        "text": text,
                    },
                )
            )
            if len(doc_batch) >= BATCH_SIZE:
                flush_inserts()

    flush_inserts()
    collection.flush()      # <-- was .commit(), which doesn't exist in zvec 0.4
    collection.optimize()   # compact + finalize index segments
    write_status(state="ready", done=total_indexed, total=len(pending))
    progress(f"\nDone. Indexed {total_indexed} chunks into {INDEX_PATH}")


def reindex(progress=print):
    if os.path.exists(INDEX_PATH):
        shutil.rmtree(INDEX_PATH, ignore_errors=True)
    ingest(progress)


_ingest_thread = None


def ensure_index_async():
    """Auto-populate: if the index is missing, kick off ingest in a daemon
    thread and return immediately. Safe to call repeatedly."""
    global _ingest_thread
    if index_exists():
        return "ready"
    if _ingest_thread and _ingest_thread.is_alive():
        return "building"
    _ingest_thread = threading.Thread(
        target=lambda: ingest(progress=lambda *a, **k: None), daemon=True
    )
    _ingest_thread.start()
    return "building"


# ---------------------------------------------------------------------------
# Search (vector retrieval + cross-encoder rerank)
# ---------------------------------------------------------------------------
def search(query, topk=5, fetch_k=25, rerank=True, include_text=True):
    """Semantic search. Over-fetches fetch_k candidates, reranks with a
    cross-encoder, returns the topk best with text + live MDN URLs."""
    if not index_exists():
        state = ensure_index_async()
        return {"error": f"index not ready (state: {state})", "results": []}

    collection = open_index()
    has_text = index_has_text_field(collection)

    emb = get_embedder().encode(query, normalize_embeddings=True).tolist()
    fields = ["path", "title", "chunk"] + (["text"] if has_text else [])
    hits = collection.query(
        vectors=zvec.VectorQuery("embedding", vector=emb),
        topk=fetch_k if rerank else topk,
        output_fields=fields,
    )

    results = []
    for h in hits:
        rel = h.field("path") or ""
        ci = h.field("chunk") or 0
        text = h.field("text") if has_text else chunk_text_from_disk(rel, ci)
        results.append(
            {
                "title": h.field("title") or rel,
                "path": rel,
                "url": mdn_url_for(rel),
                "chunk": ci,
                "vector_score": float(h.score),
                "text": text or "",
            }
        )

    if rerank and results:
        ce = get_reranker()
        pairs = [(query, (r["text"] or r["title"])[:2000]) for r in results]
        scores = ce.predict(pairs)
        for r, s in zip(results, scores):
            r["rerank_score"] = float(s)
        results.sort(key=lambda r: r["rerank_score"], reverse=True)

    results = results[:topk]
    if not include_text:
        for r in results:
            r.pop("text", None)
    return {"query": query, "reranked": bool(rerank), "results": results}


def status():
    info = read_status()
    if index_exists():
        try:
            c = open_index()
            info.update(
                state="ready",
                doc_count=doc_count(c),
                stores_text=index_has_text_field(c),
                index_path=INDEX_PATH,
            )
        except Exception as e:
            info.update(state="error", error=str(e))
    elif info.get("state") not in ("cloning", "loading_model", "walking", "indexing"):
        info["state"] = "missing"
    return info
