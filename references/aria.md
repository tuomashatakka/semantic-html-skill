# ARIA — native first, then ARIA done right

The lookup tables (element → implicit role, every role, every state and
property) live in `aria-index.md`, which is generated from MDN. This file
covers how to decide.

## The five rules of ARIA (W3C *Using ARIA*), in order of how often they save you

1. **Don't use ARIA if a native element or attribute exists.** Use `<button>`
   rather than `role="button"`, `<nav>` rather than `role="navigation"`,
   `<input type="checkbox">` rather than `role="checkbox"`, `hidden`/`inert`
   rather than `aria-hidden` games.
2. **Don't change native semantics** unless you really must. For example,
   don't put `role="heading"` on a `<button>`. Nest the elements instead:
   `<h2><button>…</button></h2>`.
3. **Every interactive ARIA control must be keyboard-operable.** A
   `role="tab"` needs arrow keys, Home/End and roving `tabindex`.
4. **Never put `role="presentation"`/`none` or `aria-hidden="true"` on a
   focusable element.**
5. **Every interactive element needs an accessible name.**

No ARIA is better than bad ARIA. A wrong role, or a state that isn't kept in
sync, actively misleads assistive-technology users. Pages with ARIA tend to
have more accessibility errors, not fewer.

## How to decide

```text
Is there a native element with this meaning + behaviour?
├─ yes → use it (style it; don't rebuild it)
└─ no  → is there a native *attribute* (hidden, inert, disabled, required,
         popover, command/commandfor, open, aria-current-equivalent)?
         ├─ yes → use it
         └─ no  → ARIA pattern from the APG (https://www.w3.org/WAI/ARIA/apg/patterns/)
                   ├─ role on the right element
                   ├─ required owned elements (tablist › tab, listbox › option…)
                   ├─ name (aria-label / aria-labelledby)
                   ├─ states kept in sync in script (aria-selected, aria-expanded…)
                   └─ full keyboard model
```

## Accessible names, in priority order

1. `aria-labelledby="id1 id2"` points at visible text. It wins over
   everything else.
2. `aria-label="…"` is for when there is no visible text (icon buttons). It
   isn't translated by some tools, so prefer visible text.
3. Native labelling: `<label>`, `<caption>`, `<legend>`, `<figcaption>`,
   `alt`, `<title>` in SVG.
4. Contents, for roles that allow naming from content (buttons, links,
   headings).
5. `title` is a last resort, because it's unreliable.

Descriptions add to a name: use `aria-describedby` for hints and errors, and
`aria-details` for rich structured detail.

**Naming is prohibited** on `generic` (`<div>`, `<span>`), `presentation`,
`paragraph`, `code`, `strong`/`em` and a few others. Putting `aria-label` on
a bare `<div>` does nothing reliable.

## Landmarks

| Element | Role | Condition |
| --- | --- | --- |
| `<header>` | `banner` | only when not inside `<article>`/`<aside>`/`<main>`/`<nav>`/`<section>` |
| `<footer>` | `contentinfo` | same scoping as `<header>` |
| `<nav>` | `navigation` | label it when there is more than one: `aria-label="Primary"` |
| `<main>` | `main` | exactly one per page |
| `<aside>` | `complementary` | |
| `<section>` | `region` | only when it has an accessible name (`aria-labelledby` pointing at its heading) |
| `<form>` | `form` | only when named |
| `<search>` | `search` | wrap the search form in it |

When the same landmark type appears more than once, give each a unique
label. Don't add the word "navigation" to a nav's label: screen readers
already announce the role.

## Live regions

- `role="status"` (polite) is for "Saved", result counts and progress text.
  `<output>` is an implicit status region for computed results.
- `role="alert"` (assertive) is for urgent errors only. Use it sparingly.
- `aria-live="polite"` plus `aria-atomic="true"` suits custom regions.
- The region must **exist in the DOM before** its content changes. Change its
  text; don't insert the region together with the text.

## Patterns that still need ARIA (no native equivalent yet)

| Pattern | Roles | Notes |
| --- | --- | --- |
| Tabs | `tablist` › `tab` (+ `aria-selected`, `aria-controls`) and `tabpanel` | arrow keys, roving `tabindex`; see `templates/tabs.html` |
| Combobox / autocomplete | `combobox` + `listbox` › `option` | Try `<input list>` + `<datalist>` first |
| Tree view | `tree` › `treeitem` (+ `group`) | |
| Data grid (interactive) | `grid` › `row` › `gridcell` | A static table is just `<table>` |
| Toolbar | `toolbar` | arrow-key roving between controls |
| Feed | `feed` › `article` | infinite scroll |
| Switch | `<input type="checkbox" role="switch">` | keep the native checkbox and add the role |
| Breadcrumb current page | `aria-current="page"` | on the link to the current page, also in nav menus |
| Disabled but focusable | `aria-disabled="true"` | when users must still be able to discover the control |

## Common mistakes

- `aria-expanded` on the content panel instead of the control. It belongs on
  the button.
- `aria-controls` used as if it did something. Most AT ignores it, so it's
  harmless but not a fix.
- `aria-hidden="true"` on a parent of focusable elements. Use `inert`.
- `role="dialog"` on a div instead of `<dialog>`. You lose focus trapping,
  Esc handling and the top layer.
- `role="list"` added to every `<ul>`. Only add it when `list-style: none`
  removes list semantics in Safari *and* the count matters to users.
- `role="img"` on an `<svg>` with no name. Add `aria-label` or a `<title>`,
  or `aria-hidden="true"` if it's decorative.

Deep lookups: `get_element <name>` gives an element's implicit and permitted
roles; `search_mdn "<role> role required owned elements"` covers role
contracts.
