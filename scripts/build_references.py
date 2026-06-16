#!/usr/bin/env python3
"""
build_references.py — digest the MDN content clone into curated, macro-free
markdown reference files that ship *with* the skill (the "works offline,
no index needed" half of the skill).

It reads the same `mdn_content` clone that mdn_rag.py uses, so after a
`--reindex` (which refreshes the clone) you can regenerate the digests:

    .venv/bin/python scripts/build_references.py

Outputs (into ../references/ relative to this script):
    elements.md       — every HTML element, grouped by semantic function,
                        with deprecated / non-standard / experimental flags
    content-model.md  — the seven content categories (the nesting rules)
    aria.md           — the rules of ARIA + landmark<->element map + role/attr index

patterns.md is hand-curated (enforcement heuristics) and is NOT regenerated
here, so this script never clobbers it.
"""

import os
import re
import sys
from pathlib import Path

# Reuse the same data dir / clone location as the RAG library.
SKILL_DIR = Path(
    os.environ.get(
        "SEMANTIC_HTML_HOME",
        os.path.expanduser("~/.config/opencode/skills/semantic-html"),
    )
)
# When run from a fresh checkout the clone may not be beside this script;
# fall back to the opencode install which is where the 200MB clone lives.
CANDIDATE_CLONES = [
    SKILL_DIR / "mdn_content",
    Path(__file__).resolve().parent.parent / "mdn_content",
    Path(os.path.expanduser("~/.config/opencode/skills/semantic-html/mdn_content")),
]
REPO_DIR = next((c for c in CANDIDATE_CLONES if c.exists()), CANDIDATE_CLONES[0])
EN_US = REPO_DIR / "files" / "en-us"
OUT_DIR = Path(__file__).resolve().parent.parent / "references"

ELEMENTS_DIR = EN_US / "web/html/reference/elements"
CONTENT_CATEGORIES = EN_US / "web/html/guides/content_categories/index.md"
ARIA_INDEX = EN_US / "web/accessibility/aria/index.md"
ARIA_ROLES_DIR = EN_US / "web/accessibility/aria/reference/roles"
ARIA_ATTRS_DIR = EN_US / "web/accessibility/aria/reference/attributes"


# ---------------------------------------------------------------------------
# Macro / link stripping — turn MDN-flavoured markdown into plain prose
# ---------------------------------------------------------------------------
# NOTE: MDN macro names are case-insensitive in practice ({{HTMLElement}},
# {{htmlelement}}, {{Glossary}}, {{Cssxref}}, ...), so every macro regex below
# uses re.IGNORECASE. Getting this wrong silently nukes element names.
I = re.IGNORECASE

# Shared: capture the element name from any HTMLElement macro form.
HTMLEL_RE = re.compile(r"\{\{\s*htmlelement\(\s*['\"]([^'\"]+)['\"]", I)


def _kumascript(text):
    """Resolve the {{...}} macros that show up in MDN reference prose."""
    # {{HTMLElement("button")}} / {{htmlelement('a', 'anchor')}} -> <button>
    text = re.sub(
        r"\{\{\s*htmlelement\(\s*['\"]([^'\"]+)['\"][^}]*\)\s*\}\}",
        lambda m: f"<{m.group(1)}>",
        text,
        flags=I,
    )
    # {{Glossary("Element","elements")}} -> elements ; {{Glossary("HTML")}} -> HTML
    text = re.sub(
        r"\{\{\s*glossary\(\s*['\"]([^'\"]+)['\"]\s*(?:,\s*['\"]([^'\"]+)['\"]\s*)?\)\s*\}\}",
        lambda m: m.group(2) or m.group(1),
        text,
        flags=I,
    )
    # {{Cssxref("text-align")}} -> text-align ; {{domxref("HTMLElement")}} -> HTMLElement
    text = re.sub(
        r"\{\{\s*(?:cssxref|domxref|jsxref|svgelement|svgattr|httpheader|httpmethod)\(\s*['\"]([^'\"]+)['\"][^}]*\)\s*\}\}",
        lambda m: m.group(1),
        text,
        flags=I,
    )
    # status inline badges
    text = re.sub(r"\{\{\s*deprecated_inline\s*\}\}", "*(deprecated)*", text, flags=I)
    text = re.sub(r"\{\{\s*non-?standard_inline\s*\}\}", "*(non-standard)*", text, flags=I)
    text = re.sub(r"\{\{\s*experimental_inline\s*\}\}", "*(experimental)*", text, flags=I)
    text = re.sub(r"\{\{\s*optional_inline\s*\}\}", "*(optional)*", text, flags=I)
    # any remaining macro -> drop it
    text = re.sub(r"\{\{[^}]*\}\}", "", text)
    return text


def _delink(text):
    """[label](url) -> label ; bare autolinks left as-is."""
    return re.sub(r"\[([^\]]+)\]\((?:[^)]+)\)", r"\1", text)


def clean(text):
    return re.sub(r"\s+", " ", _delink(_kumascript(text))).strip()


def fmt_el(name):
    """Render an element name for display, normalising MDN slug quirks."""
    if name.lower() == "heading_elements":
        return "`<h1>`–`<h6>`"
    return f"`<{name}>`"


def strip_frontmatter(text):
    return re.sub(r"^---\n.*?\n---\n", "", text, flags=re.DOTALL)


# ---------------------------------------------------------------------------
# Per-element status (deprecated / non-standard / experimental)
# ---------------------------------------------------------------------------
def element_status_map():
    """name -> set of status tags, parsed from each element's frontmatter."""
    out = {}
    if not ELEMENTS_DIR.exists():
        return out
    for child in sorted(ELEMENTS_DIR.iterdir()):
        idx = child / "index.md"
        if not (child.is_dir() and idx.exists()):
            continue
        head = idx.read_text(encoding="utf-8", errors="ignore")[:600]
        m = re.search(r"^---\n(.*?)\n---", head, re.DOTALL)
        fm = m.group(1) if m else ""
        tags = set()
        sm = re.search(r"status:\s*\n((?:\s*-\s*\w[\w-]*\n?)+)", fm)
        if sm:
            for t in re.findall(r"-\s*([\w-]+)", sm.group(1)):
                tags.add(t.lower())
        out[child.name] = tags
    return out


# ---------------------------------------------------------------------------
# elements.md  — parse the canonical grouped table in elements/index.md
# ---------------------------------------------------------------------------
def build_elements():
    src = (ELEMENTS_DIR / "index.md").read_text(encoding="utf-8", errors="ignore")
    src = strip_frontmatter(src)
    status = element_status_map()

    lines = src.splitlines()
    out = [
        "# HTML Elements — grouped by semantic function",
        "",
        "Digested from MDN `web/html/reference/elements/`. Pick the most specific",
        "element that carries the right meaning; reach for `<div>`/`<span>` only when",
        "nothing semantic fits. Flags: **DEPRECATED** = do not use (CSS/semantic",
        "replacement exists), **non-standard** / **experimental** = avoid in production.",
        "",
    ]

    current_group = None
    for ln in lines:
        h = re.match(r"^##\s+(.*)$", ln)
        if h:
            current_group = clean(h.group(1))
            out.append(f"\n## {current_group}\n")
            continue
        if not ln.startswith("|"):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        el_cell, desc_cell = cells[0], cells[1]
        if el_cell.lower() in ("element", "") or set(el_cell) <= set("-: "):
            continue  # header / separator row
        # element names actually referenced in this row
        names = HTMLEL_RE.findall(el_cell)
        label = clean(el_cell)
        if names:
            label = ", ".join(fmt_el(n) for n in names)
        flags = set()
        for n in names:
            flags |= status.get(n, set())
        flag_str = ""
        if "deprecated" in flags:
            flag_str = " — **DEPRECATED**"
        elif "non-standard" in flags:
            flag_str = " — **non-standard**"
        elif "experimental" in flags:
            flag_str = " — **experimental**"
        out.append(f"- {label}{flag_str}: {clean(desc_cell)}")

    (OUT_DIR / "elements.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    n_dep = sum(1 for t in status.values() if "deprecated" in t)
    print(f"  elements.md      ({len(status)} elements, {n_dep} deprecated)")


# ---------------------------------------------------------------------------
# content-model.md — the seven content categories + nesting rules
# ---------------------------------------------------------------------------
def build_content_model():
    src = strip_frontmatter(
        CONTENT_CATEGORIES.read_text(encoding="utf-8", errors="ignore")
    )
    out = [
        "# The Content Model — what nests in what",
        "",
        "Digested from MDN `web/html/guides/content_categories`. Content categories",
        "define each element's *content model*: which elements are valid descendants.",
        "Getting this right is what keeps the DOM valid and the accessibility tree clean.",
        "",
    ]
    # Keep section headers + their intro paragraph + the bulleted element list.
    blocks = re.split(r"(?=^##\s)", src, flags=re.MULTILINE)
    for blk in blocks:
        hm = re.match(r"^##\s+(.*)", blk)
        if not hm:
            continue
        title = clean(hm.group(1))
        body = blk[hm.end():]
        # first prose paragraph
        paras = [p.strip() for p in body.split("\n\n") if p.strip()]
        intro = ""
        members = []
        for p in paras:
            if p.lstrip().startswith("-") and not intro:
                continue
            if p.lstrip().startswith("-"):
                members += HTMLEL_RE.findall(p)
            elif not intro and not p.startswith(("!", ">", "|", "![")):
                intro = clean(p)
        out.append(f"## {title}\n")
        if intro:
            out.append(intro + "\n")
        if members:
            uniq = ", ".join(fmt_el(m) for m in dict.fromkeys(members))
            out.append(f"*Members:* {uniq}\n")
    (OUT_DIR / "content-model.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print("  content-model.md")


# ---------------------------------------------------------------------------
# aria.md — the rules of ARIA + landmark map + role/attribute index
# ---------------------------------------------------------------------------
def build_aria():
    src = strip_frontmatter(ARIA_INDEX.read_text(encoding="utf-8", errors="ignore"))
    # Pull the "Before using ARIA" section prose (the rules live here).
    before = ""
    m = re.search(r"##\s+Before using ARIA(.*?)(?=^##\s)", src, re.DOTALL | re.MULTILINE)
    if m:
        before = m.group(1)
    rule_lines = []
    for para in before.split("\n\n"):
        p = para.strip()
        if not p or p.startswith(("```", "|", "![")):
            continue
        p = re.sub(r"^>\s*\[!\w+\]\s*", "", p)  # drop callout tag
        p = re.sub(r"^>\s?", "", p, flags=re.MULTILINE)  # de-blockquote
        cl = clean(p)
        # skip flattened code snippets and figure intros — keep prose rules only
        if any(tok in cl for tok in ("setAttribute", "getElementById", "//", "()")):
            continue
        if len(cl) > 40 and not cl.lower().startswith(
            ("here's the markup", "this progress bar", "along with placing")
        ):
            rule_lines.append(cl)

    roles = sorted(
        p.name.replace("_role", "")
        for p in ARIA_ROLES_DIR.iterdir()
        if p.is_dir() and (p / "index.md").exists()
    ) if ARIA_ROLES_DIR.exists() else []
    attrs = sorted(
        p.name
        for p in ARIA_ATTRS_DIR.iterdir()
        if p.is_dir() and (p / "index.md").exists()
    ) if ARIA_ATTRS_DIR.exists() else []

    out = [
        "# ARIA & Accessibility — use native first",
        "",
        "Digested from MDN `web/accessibility/aria/`. ARIA *supplements* HTML for",
        "widgets/interactions that have no native element. It never changes behavior —",
        "only the accessibility tree — so anything you assert with ARIA you must also",
        "implement (keyboard, focus, state sync) yourself.",
        "",
        "## The rules, in order of how often they save you",
        "",
        "1. **First rule of ARIA: don't use ARIA.** If a native HTML element or",
        "   attribute already has the semantics and behavior you need, use it instead of",
        "   bolting a `role`/state onto a generic element. Native elements come with",
        "   keyboard support, roles, and states for free.",
        "2. **No ARIA is better than bad ARIA.** WebAIM's survey of a million home pages",
        "   found pages *with* ARIA averaged ~41% more detected errors. Wrong ARIA",
        "   actively misleads assistive tech — worse than none.",
        "3. **Don't duplicate implicit roles.** Landmark elements (`<main>`, `<nav>`,",
        "   `<header>`, `<footer>`, `<aside>`) already expose their role; adding",
        "   `role=\"navigation\"` to a `<nav>` is redundant noise.",
        "4. **Don't change native semantics.** `<h2 role=\"tab\">` breaks the heading.",
        "   Wrap instead: `<h2><span role=\"tab\">…</span></h2>` only if truly needed.",
        "5. **All interactive ARIA controls must be keyboard usable**, and never put",
        "   `role`/`aria-*`/`tabindex` on a hidden element.",
        "",
    ]
    if rule_lines:
        out.append("## In MDN's words\n")
        for r in rule_lines[:3]:
            out.append(f"> {r}\n")
    out += [
        "## Landmark element → implicit role (don't re-declare these)",
        "",
        "| Native element | Implicit ARIA role |",
        "| -------------- | ------------------ |",
        "| `<header>` (page-level) | `banner` |",
        "| `<nav>` | `navigation` |",
        "| `<main>` | `main` |",
        "| `<aside>` | `complementary` |",
        "| `<footer>` (page-level) | `contentinfo` |",
        "| `<section>` with name | `region` |",
        "| `<form>` with name | `form` |",
        "| `<search>` | `search` |",
        "| `<button>` | `button` |",
        "| `<a href>` | `link` |",
        "| `<ul>` / `<ol>` | `list` |",
        "| `<li>` | `listitem` |",
        "",
        "Prefer the native element on the left. Reach for the role on the right only",
        "when you genuinely cannot use the native element (e.g. a design system that",
        "forces a `<div>`), and then own the full behavior in script.",
        "",
    ]
    if roles:
        out.append(f"## ARIA roles available in MDN ({len(roles)})\n")
        out.append(", ".join(f"`{r}`" for r in roles) + "\n")
    if attrs:
        out.append(f"## ARIA states & properties available in MDN ({len(attrs)})\n")
        out.append(", ".join(f"`{a}`" for a in attrs) + "\n")
    out.append(
        "For the full role/state contract (required children, supported states,"
        " name-from), query the index: `search_mdn(\"<role> role aria\")`."
    )
    (OUT_DIR / "aria.md").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"  aria.md          ({len(roles)} roles, {len(attrs)} attributes)")


def main():
    if not EN_US.exists():
        print(f"!! mdn_content clone not found at {REPO_DIR}", file=sys.stderr)
        print("   Run scripts/ingest_mdn.py (or setup.sh) first to clone it.", file=sys.stderr)
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Digesting MDN clone at {REPO_DIR} -> {OUT_DIR}")
    build_elements()
    build_content_model()
    build_aria()
    print("Done. (patterns.md is hand-curated and was left untouched.)")


if __name__ == "__main__":
    main()
