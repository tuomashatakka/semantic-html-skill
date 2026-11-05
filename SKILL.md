---
name: semantic-html
description: |
  Write, review and refactor semantic, accessible HTML5 and modern CSS, the
  HTML/CSS-over-JS(X) way. Use whenever markup, styles or UI components are
  written or audited: choosing the right element, checking the content model
  (what may nest in what), fixing div-soup, headings and landmarks, forms and
  labels, deciding native element vs ARIA, replacing JS widgets and JS
  animation with native HTML (details, dialog, popover, invoker commands) and
  CSS (@layer, nesting, :has(), container queries, @starting-style,
  scroll-driven animations, view transitions), and structuring design tokens
  and components (Semantic Nodes principles). Ships a generated MDN digest
  (all elements with technical summaries, the full content-categories guide,
  ARIA index, global attributes), copy-ready templates, and a zero-dependency
  TypeScript MDN lookup (CLI + `mdn-search` MCP server).
---

# Semantic HTML + modern CSS

**Meaning before markup, platform before script.** HTML is structure, CSS is
presentation, and JS is behaviour the platform lacks. Choose elements for what
things *are*, respect the content model, use native behaviour before ARIA or
JS, style with layered CSS keyed to semantics and state, and animate in CSS.

## Workflow

1. **Writing markup.** Start from the closest template in `templates/`
   (index in `templates/README.md`). Pick elements with
   `references/elements/index.md`. Check nesting in
   `references/content-categories.md`.
2. **Reviewing or refactoring.** Run the decision procedure and the
   anti-pattern tables in `references/rules.md`, then go through its review
   checklist.
3. **Something interactive** (toggle, modal, menu, tooltip, validation,
   animation). Check `references/native-over-js.md` and
   `references/motion.md` first. Use ARIA only through `references/aria.md`.
4. **Styling.** Follow `references/css.md` (layers, nesting, tokens, semantic
   selectors) and `references/design-system.md` (token taxonomy, component
   rules), with `templates/styles/` as the reference implementation.
5. **Anything the digest doesn't answer** (an attribute's exact behaviour, a
   role's required children, Baseline status): look it up on MDN with the
   tools below. Don't guess.

## Core rules

- Use `<div>`/`<span>` only for meaning-free grouping. Use landmarks, one
  `<main>`, headings in order, lists for lists, and tables for data.
- Buttons act and links go. Never put `onclick` on a `div`, or use `href="#"`
  for a button.
- Every control has a label, related controls sit in a `fieldset`/`legend`,
  and inputs use the right `type` and `autocomplete`.
- Use the native element or attribute before ARIA. Never repeat an implicit
  role. Keep ARIA states in sync, or use a native widget that does it for you.
- Use `details`, `dialog`, `popover`, `command`/`commandfor`, `:has()` and
  `:user-invalid` before JS state. In JSX, render the semantic element; props
  carry meaning, not appearance; state goes in attributes and CSS reacts to
  it.
- CSS lives in `@layer reset, tokens, base, layout, components, utilities,
  overrides`, with shallow native nesting, `--category-role-scale` tokens,
  logical properties and container queries. No inline styles and no utility
  soup.
- Motion uses CSS transitions and keyframes, `@starting-style` +
  `allow-discrete`, scroll-driven animations and view transitions, always
  with `prefers-reduced-motion`. Use JS (WAAPI) only for gesture or physics
  motion.
- Flag Baseline status. Features marked **limited** in the references are
  progressive enhancement and need a working fallback.

## References (`references/`)

| File | Kind | Read it when you need to… |
| --- | --- | --- |
| `rules.md` | curated | **start here**: the decision procedure, block-this/write-that tables, review checklist |
| `elements/index.md` | generated | find the element for a meaning (all ~130, with implicit role and status) |
| `elements/<group>.md` | generated | an element's technical summary (categories, permitted content and parents, tag omission, implicit and permitted roles, DOM interface) and attributes |
| `content-categories.md` | generated | the full MDN *Content categories* guide, conditional membership, transparent model, element × category matrix |
| `global-attributes.md` | generated | attributes valid on every element |
| `aria.md` | curated | native-vs-ARIA decisions, naming, landmarks, live regions, patterns that still need ARIA |
| `aria-index.md` | generated | element → implicit role map, all roles and states with one-liners |
| `native-over-js.md` | curated | the platform feature that replaces your JS (with Baseline), JSX component rules |
| `css.md` | curated | layers, nesting, tokens, semantic selectors, theming, layout, focus, `@scope` |
| `motion.md` | curated | CSS-first animation: transitions, `@starting-style`, `::details-content`, scroll-driven, view transitions |
| `design-system.md` | curated | Semantic Nodes concepts: tokens, atomic/molecular/layout components, minimal interfaces |
| `forms.md` | curated | input types, `autocomplete` tokens, native validation, error pattern |
| `accessibility.md` | curated | WCAG 2.2 AA essentials: alt text, focus, contrast, targets, testing |

## MDN lookup (TypeScript, zero runtime dependencies)

Use the `mdn-search` MCP tools when they're available. Otherwise use the CLI.
It needs Node ≥ 22.18 (native TypeScript) and nothing to install.

| MCP tool | CLI | Use |
| --- | --- | --- |
| `get_element(name, full?)` | `node src/cli.ts element dialog [--full]` | technical summary and attributes for one element (live, cached) |
| `search_mdn(query, topk?, prefix?)` | `node src/cli.ts search "…" [-k 8] [--prefix Web/CSS]` | ranked MDN section chunks with URLs |
| `get_mdn_page(page, sections?)` | `node src/cli.ts page <slug\|url\|title> [-s accessibility]` | read any MDN page as Markdown |
| `lookup_mdn_title(query)` | `node src/cli.ts title ":has()"` | find pages across all ~15k MDN docs |
| `index_status()` / `reindex_mdn(embed?, scope?)` | `node src/cli.ts status` / `index [--embed]` | index state, rebuild |

- `element`, `page` and `title` work immediately: they fetch MDN's rendered
  page JSON and cache it under `~/.cache/semantic-html`.
- `search` uses a local BM25 index over HTML, CSS, ARIA and accessibility
  pages, which builds in about 2 minutes. The MCP server builds it in the
  background on first start, and title matches are returned while it builds.
  Running `npm install` (the optional `@huggingface/transformers`) followed by
  `node src/cli.ts index --embed` turns on hybrid semantic search with
  cross-encoder reranking.
- Register the server: `claude mcp add mdn-search -- node <skill-dir>/src/mcp/server.ts`.

Regenerate the digest after MDN changes with `npm run build:refs`. It rewrites
only the generated files.
