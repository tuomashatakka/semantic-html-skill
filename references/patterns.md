# Enforcement Patterns — block this, write that

Hand-curated heuristics for *applying* the reference. This is the part of the
skill that does the actual work: when you read or write HTML, scan for these
anti-patterns and replace them with the semantic equivalent. The reasoning,
not just the rule, matters — so each one says *why*.

## How to choose an element (the decision procedure)

1. **Name the meaning first.** What *is* this thing — a navigation region, a
   self-contained article, a button, a list? Pick the element whose name
   matches that meaning (see `elements.md`, grouped by function).
2. **Check it can legally hold its children** (see `content-model.md`). A `<p>`
   takes only phrasing content, so a `<div>` inside a `<p>` is invalid; a
   `<ul>` takes only `<li>`. Invalid nesting silently corrupts the a11y tree.
3. **Only then fall back to `<div>`/`<span>`** — and only for grouping/styling
   when nothing semantic fits. `<div>` is block-level flow content with no
   meaning; `<span>` is its inline counterpart. They are the *last* resort, not
   the default.
4. **Reach for ARIA last of all** (see `aria.md`): only when no native element
   carries the semantics, and then you own keyboard + state in script.

## Anti-pattern → fix

| Smell (block this) | Why it's wrong | Write this instead |
| --- | --- | --- |
| `<div onclick>` / `<span onclick>` as a button | Not focusable, no Enter/Space, no role, invisible to AT | `<button type="button">` |
| `<a>` with no `href` used as a button | A link without a destination isn't a link | `<button>` (or add a real `href`) |
| `<button>` used to navigate to a URL | Buttons act, links go places | `<a href="…">` |
| `<div class="header">` / `class="nav"` / `class="footer"` | Re-labels in CSS what HTML already names | `<header>` / `<nav>` / `<footer>` |
| Stack of `<div class="card">…</div>` for distinct posts | No outline, no landmarks | `<article>` per item, inside a `<section>`/`<main>` |
| `<div class="title">` for a section title | Headings build the document outline & AT navigation | `<h1>`–`<h6>` in order |
| `<br>` used for spacing / fake paragraphs | `<br>` is a line break *inside* phrasing, not a layout tool | separate `<p>` elements + CSS margin |
| `<b>` for importance, `<i>` for emphasis | Those are presentational; meaning is lost to AT/SEO | `<strong>` (importance), `<em>` (stress emphasis) |
| `<div>` bullet lists with `•` glyphs | Not announced as a list, no item count | `<ul>`/`<ol>` + `<li>` |
| `<table>` for page layout | Tables imply tabular data relationships | CSS grid/flex on semantic containers |
| `<input>` with no associated `<label>` | Control has no accessible name | `<label for="id">` or wrap the input in the `<label>` |
| `role="navigation"` on a `<nav>` | Duplicates an implicit role (noise) | drop the role — `<nav>` already has it |
| `<div role="button" tabindex="0">` from scratch | Re-implements `<button>` badly | `<button>`; style it, don't rebuild it |
| `onclick` + JS to toggle show/hide panels | JS where the platform has a native widget | `<details>`/`<summary>`, `<dialog>`, `:target`, popover |

## Document structure (landmarks)

A page should expose one `<main>`, with `<header>`/`<nav>`/`<footer>` as
siblings or nested appropriately. These map to landmark roles screen-reader
users jump between (see the table in `aria.md`). Generic `<div>` wrappers create
no landmarks, so a div-only page is a flat, unnavigable blob to AT.

```html
<header>…site masthead, logo, primary nav…</header>
<nav aria-label="Primary">…</nav>
<main>
  <article>
    <h1>Title</h1>
    <section><h2>…</h2>…</section>
  </article>
  <aside>…related/indirect content…</aside>
</main>
<footer>…contentinfo: copyright, author…</footer>
```

## Headings

Headings define the outline, not the font size. Don't skip levels for visual
effect (no `<h1>` → `<h4>`); size with CSS. One `<h1>` per page is the safe
default. A `<section>` should almost always start with a heading — that's what
makes it a meaningful section rather than a styled box.

## Forms

Every control needs a programmatic label (`<label for>` or wrapping). Group
related controls (e.g. a set of radios) in `<fieldset>` with a `<legend>`.
Prefer the right `<input type>` (`email`, `tel`, `url`, `date`, `number`) — it
brings validation, mobile keyboards, and semantics for free. Use native
constraint validation (`required`, `pattern`, `min`/`max`) before reaching for
JS validators.

## Text-level semantics

`<strong>` = importance, `<em>` = stress emphasis, `<mark>` = relevance/
highlight, `<cite>` = work title, `<code>`/`<kbd>`/`<samp>` = code/input/output,
`<time datetime>` = machine-readable dates, `<abbr title>` = abbreviations,
`<q>`/`<blockquote cite>` = quotations. These survive into AT and SEO; the
presentational `<b>`/`<i>`/`<u>`/`<s>` do not carry meaning (use them only for
the narrow typographic cases their MDN entries describe, or use CSS).

## Prefer CSS-native over JS

The platform now covers a lot that used to need JavaScript: `<details>`/
`<summary>` for disclosure, `<dialog>` for modals, the Popover API, `:target`,
`:has()`, container queries, scroll-driven animations, `accent-color`,
`color-scheme`. Reach for these before wiring up click handlers and state — they
are accessible by default and don't ship as runtime cost.

## When `<div>` / `<span>` ARE correct

Pure grouping for layout/styling with no semantic meaning of its own — a flex/
grid wrapper, a styling hook around an inline run that shares a `lang` or color.
That's legitimately what they're for. The rule isn't "never use div"; it's
"don't use div *instead of* an element that has the meaning you need."

## Deep lookups

For anything not covered here — a specific element's exact attributes, a role's
required owned elements, browser-compat, CSS property behavior — query the live
index instead of guessing: `search_mdn("…")` (MCP) or
`ingest_mdn.py --query "…"` (CLI). See SKILL.md.
