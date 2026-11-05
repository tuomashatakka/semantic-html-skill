# Templates

Copy-ready, validated examples (`npm run check:templates` runs html-validate
with the recommended and a11y presets, plus `no-inline-style`). Every HTML file
links `styles/main.css`, so the snippets render styled as they stand.

| Template | Use it for | Key elements and attributes |
| --- | --- | --- |
| `document-shell.html` | the `<head>` of every page | `lang`, `charset`, viewport, `<title>`, description, `color-scheme`, canonical, icons, OG, module script |
| `page-layout.html` | app or site page skeleton | skip link, `header`/`nav[aria-label]`/`main`/`aside`/`footer`, `<search>`, labelled `section`s, `<dl>` stats |
| `article.html` | blog post, news story, doc page | `article` › `header` (byline, `<time datetime>`), ToC `nav`, `section[aria-labelledby]`, `figure`, `blockquote[cite]`/`cite`, footnotes, comments as nested `article` |
| `navigation.html` | menus and wayfinding | `aria-current="page"`, breadcrumb `ol`, pagination with `rel=prev/next`, `details[name]` sub-nav, no `role="menu"` |
| `forms-sign-in.html` | login | `autocomplete="username"`/`current-password`, `.field` + `.error` with `:user-invalid` |
| `forms-sign-up.html` | registration | `fieldset`/`legend`, visible "(required)", hint + error with `aria-describedby`, `minlength`, `new-password` |
| `forms-contact.html` | contact or address | address `autocomplete` tokens, `select` › `optgroup`, `datalist`, `field-sizing` textarea |
| `forms-search.html` | search and results | `<search>`, `type=search`, `role=status` result count, `ol` of `article` results, `<mark>` |
| `forms-choices.html` | settings | radio and checkbox groups, `role="switch"` on a native checkbox, range + `<output>` |
| `data-table.html` | tabular data | `caption`, `colgroup`, `thead`/`tbody`/`tfoot`, `th[scope]`, `aria-sort`, scroll region, `headers=` for complex tables |
| `media.html` | images, video, audio, embeds | `picture`/`srcset`/`sizes`, width/height, `alt` vs `alt=""`, `track kind=captions`, titled `iframe`, SVG `aria-hidden` vs `role=img` |
| `disclosure.html` | FAQ and accordion | `details`/`summary`, exclusive `details[name]`, `dl` + `dfn` glossary |
| `dialog.html` | modals and confirmations | `command="show-modal"`/`close`/`request-close` + `commandfor`, `closedby`, `form method=dialog`, `role=alertdialog` |
| `popover.html` | menus, toggletips, toasts | `popover`, `popovertarget`, `command="toggle-popover"`, `popover="hint"`, `popover="manual"` + `role=status`, anchor positioning |
| `tabs.html` | tabbed panels (needs JS) | APG tabs: `tablist`/`tab`/`tabpanel`, `aria-selected`, roving `tabindex`, arrow keys |
| `cards-and-lists.html` | product or post collections | `ul.cards` › `li` › `article.card`, stretched heading link, `data`, `meter`, `del`/`ins`, `dl` specs, `ol` steps |
| `text-semantics.html` | inline meaning | `strong`/`em`/`mark`/`time`/`data`/`abbr`/`dfn`/`q`/`cite`/`code`/`kbd`/`samp`/`var`/`sub`/`sup`/`del`/`ins`/`s`/`small`/`i`/`b`/`ruby`/`address`/`wbr`/`bdi` |
| `feedback.html` | progress and status | `progress` (determinate and indeterminate), `meter` with low/high/optimum, `output`, `role=status` vs `role=alert`, `aria-busy` |

## Styles (`styles/`)

| File | Layer | Contents |
| --- | --- | --- |
| `main.css` | — | declares the layer order and imports the rest |
| `reset.css` | `reset` | box-sizing, margins, media defaults, a `[hidden]` guard |
| `tokens.css` | `tokens` | `--category-role-scale` primitives → semantic tokens, `light-dark()` theme, motion and focus tokens |
| `base.css` | `base` | element styling with zero classes: type scale, links, `:focus-visible`, tables, forms, reduced-motion guard |
| `layout.css` | `layout` | landmarks grid, `.flow`, `.cluster`, `.grid`, skip link |
| `components.css` | `components` | `button.primary`/`.danger`/`.ghost`, `article.card` (container query), `details` animation, `dialog`/`[popover]` enter and exit (`@starting-style`), anchor positioning, tabs, form errors, breadcrumbs and pagination, tables, scroll-driven progress, view transitions |
| `utilities.css` | `utilities` | `.visually-hidden` |

## JSX (`jsx/`)

React counterparts that follow the same rules: they render the semantic
element, use minimal union-typed props, have no `className`/`style`/appearance
props, keep state in attributes, and do all motion in CSS.

| Component | Renders | Notes |
| --- | --- | --- |
| `Button.tsx` | `<button type="button">`, or `<a class="button">` when given `href` | `variant`, `busy` → `aria-busy` (CSS spinner) |
| `Dialog.tsx` | `<dialog>` › `<form method="dialog">` | opened by `DialogTrigger` via `command="show-modal"`; `onClose(returnValue)`; `closedBy` |
| `Disclosure.tsx` | `<details>`/`<summary>` | `group` → exclusive accordion (`name`); uncontrolled |
| `Field.tsx` | `.field` › `label` + `input` + hint + error | ids wired with `useId`; `invalid` → `aria-invalid` |
| `Card.tsx` | `article.card` inside `ul.cards` › `li` | heading `level` prop; stretched link; decorative image |
