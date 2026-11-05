# Rules — the decision procedure + block-this/write-that

This is the core of the skill. When you write or review markup, run the
procedure, then scan for the smells below and replace each with its fix. Every
rule comes with its reason, because the reason is what lets you handle cases
the table doesn't cover.

## The decision procedure

1. **Name the meaning.** Say what the thing *is*: a site header, a list of
   products, a self-contained post, a control that acts, a link that goes
   somewhere. Then pick the element whose name says that
   (`elements/index.md`).
2. **Check the content model.** Can this element sit inside its parent, and
   can it hold its children (`content-categories.md`)? `<p>` takes only
   phrasing content, `<ul>` takes only `<li>`, and an `<a>` may not contain
   another interactive element. The parser silently "fixes" invalid nesting,
   and that breaks the DOM, your CSS and the accessibility tree.
3. **Use the platform's behaviour.** Before you write JS, check
   `native-over-js.md`. `<details>`, `<dialog>`, `popover`, `command`/
   `commandfor`, form validation, `:has()` and `:user-invalid` give you
   accessible behaviour for free.
4. **Style with CSS, using the structure you already have.** Select by
   element, structure, and ARIA or `data-*` state. Add a class only for a real
   variant, and put it in a layer (`css.md`). Animate with CSS (`motion.md`).
5. **ARIA comes last** (`aria.md`), and only when no native element carries
   the semantics. Once you use it, keyboard support, focus and state are
   your job.
6. **Use `<div>`/`<span>` only for grouping or a styling hook** with no
   meaning of its own. They are a legitimate last resort, not a default.

## Anti-pattern → fix

### Structure

| Smell (block this) | Why it's wrong | Write this instead |
| --- | --- | --- |
| `<div class="header">`, `.nav`, `.footer`, `.sidebar`, `.main` | CSS-only names don't create landmarks, so screen-reader users can't jump to them | `<header>`, `<nav>`, `<footer>`, `<aside>`, `<main>` |
| More than one visible `<main>`, or `<main>` inside `<article>`/`<aside>`/`<nav>` | Only one main landmark per document is allowed | One `<main>`, a direct child of `<body>` or of a generic wrapper |
| A stack of `<div class="card">` for distinct posts or products | No list semantics and no item count | `<ul>` › `<li>` › `<article>` (`templates/cards-and-lists.html`) |
| `<section>` with no heading | A section without a name is just a styled box | Give it an `<h2>`–`<h6>`, or use `<div>` |
| `<div class="title">`, or `<p class="h2">` | Headings build the outline and AT heading navigation | `<h1>`–`<h6>` in order. Size them with CSS |
| Skipped heading levels for looks (`h1` → `h4`) | Breaks the outline | Next level down. Restyle with CSS |
| `<br><br>` for spacing, or fake paragraphs | `<br>` is a line break inside phrasing content (poems, addresses) | Separate `<p>`s plus margin or `gap` |
| `<hr>` as decoration | `<hr>` is a thematic break | A CSS `border-block-start` |
| `<table>` for layout | Implies data relationships | CSS grid or flex on semantic containers |
| `<blockquote>` for indentation | It means "quoted from elsewhere" | `margin-inline-start` |

### Controls and links

| Smell | Why | Fix |
| --- | --- | --- |
| `<div onclick>` / `<span onclick>` | Not focusable, no Enter/Space, no role | `<button type="button">` |
| `<a href="#">` or `<a>` without `href` used as a button | A link with no destination; wrong semantics, breaks middle-click | `<button type="button">` |
| `<button>` that navigates | Buttons act, links go places | `<a href="/path">` |
| `<div role="button" tabindex="0">` | A poor re-implementation of `<button>` | `<button>`. Restyle it with `all: unset` plus focus styles if needed |
| `<button>` inside a `<form>` with no `type` | Defaults to `submit` | Always set `type="button"` or `type="submit"` |
| Icon-only button with no name | Announced as "button" and nothing else | Visible text, or `aria-label`, or visually hidden text. Mark the SVG `aria-hidden="true"` |
| "Click here" / "Read more" link text | Means nothing out of context in the links list | Text that describes the destination |
| `target="_blank"` with no warning | Unexpected context switch | Avoid it, or say "(opens in new tab)" |
| `tabindex="1"` (positive values) | Breaks the natural focus order | Fix the DOM order. Use only `0`/`-1` |
| `outline: none` with no replacement | Keyboard users lose their place | A `:focus-visible` style with at least 3:1 contrast |

### Forms

| Smell | Why | Fix |
| --- | --- | --- |
| `<input>` with only a `placeholder` | The placeholder vanishes, has low contrast, and isn't a label | `<label for>` or a wrapping `<label>` |
| A radio or checkbox group without a group label | AT doesn't announce the question | `<fieldset>` + `<legend>` |
| `type="text"` for email, phone, URL, number or date | Loses the matching keyboard, validation and autofill | `type="email"`, `tel`, `url`, `number`, `date`… plus `autocomplete` |
| JS-only validation | Duplicates the platform and skips AT announcements | `required`, `pattern`, `min`/`max`, `minlength`; style with `:user-invalid` |
| An error shown only in red | Color alone carries no meaning for some users, and AT never hears it | Error text linked with `aria-describedby`, an icon plus text, and `aria-invalid="true"` |
| A custom select built from divs | Hard to make keyboard- and AT-correct | `<select>` (customizable `<select>` where supported) or `<datalist>` |

### Text-level semantics

| Smell | Why | Fix |
| --- | --- | --- |
| `<b>` for importance, `<i>` for emphasis | Presentational, so no meaning reaches AT | `<strong>`, `<em>`. Keep `<b>`/`<i>` for their narrow typographic uses: keywords, terms, foreign words |
| `<font>`, `<center>`, `<big>`, `<tt>`, `<strike>`, `<marquee>` | Obsolete | CSS. See `elements/obsolete.md` |
| A date as plain text | Not machine-readable | `<time datetime="2026-11-05">` |
| A bullet glyph (`•`) per line in a div | Not announced as a list | `<ul>` › `<li>` |
| `<img>` without `alt` | Screen readers read the filename | Meaningful `alt`, or `alt=""` for decoration |
| `<abbr>` without the expansion on first use | Unclear | Spell it out in the text, with `<abbr title>` as a hint |
| Code shown in `<span class="code">` | Not marked as code | `<code>`, `<kbd>`, `<samp>`, `<var>`, `<pre>` |

### ARIA misuse

| Smell | Why | Fix |
| --- | --- | --- |
| `role="navigation"` on `<nav>`, or `role="button"` on `<button>` | Repeats the implicit role (`aria-index.md`) | Remove it |
| `aria-label` on a `<div>`/`<span>` with no role | Naming isn't allowed on `generic` | Give it a real element or role, or use visible text |
| `aria-hidden="true"` on something focusable | Creates a focusable "ghost" | `inert` or `hidden`, or make it unfocusable |
| `role="menu"` for site navigation | A menu is an application widget with arrow-key semantics | `<nav>` › `<ul>` of links |
| `role="presentation"` on an interactive element | Ignored, and confusing | Remove the role or the interactivity |
| `aria-*` set but never updated (`aria-expanded`) | AT gets told a lie | Native `<details>`, `popover` or `command`, which keep their state in sync for you |

### CSS / JS

| Smell | Why | Fix |
| --- | --- | --- |
| Inline `style="…"`, or `style` props in JSX for static design | Bypasses the cascade, layers and tokens | A class or element selector in a layer, values from tokens |
| Utility-class soup (`class="p-4 mt-2 flex text-sm …"`) | Puts presentation in markup and hides meaning | Semantic selectors plus a few variant classes (`design-system.md`) |
| `!important` wars and `#id` selectors | Specificity debt | `@layer` order and `:where()` |
| `el.classList.toggle('open')` plus a click handler for show/hide | JS doing what `<details>`, `popover` or `command` do | `native-over-js.md` |
| JS animation (`requestAnimationFrame`, GSAP, Framer Motion) for enter/exit, hover or scroll effects | Main-thread cost, ignores reduced motion | CSS transitions, `@starting-style`, scroll-driven animations (`motion.md`) |
| Media queries for component layout | Components don't know the viewport | Container queries |
| Physical properties (`margin-left`) in reusable components | Break in RTL and vertical writing | Logical properties (`margin-inline-start`) |

## When `<div>`/`<span>` ARE correct

- A wrapper for a grid or flex layout that has no meaning of its own.
- Grouping `<dt>`/`<dd>` pairs inside `<dl>`, which the spec allows.
- A styling hook around an inline run, or a run with its own `lang` or `dir`.
- The host of an ARIA widget pattern that has no native element (tabs,
  tree, grid). Add the role and own the keyboard behaviour.

The rule isn't "never use div". It's "don't use div *instead of* an element
that has the meaning you need".

## Review checklist (paste into PR reviews)

```text
□ one <main>; header/nav/footer/aside landmarks; skip link to #main
□ one <h1>; no skipped heading levels; every <section> has a heading
□ lists are lists; tables have <caption> + <th scope>
□ every control has a label; groups use fieldset/legend; correct input types + autocomplete
□ buttons act / links go; no div-buttons; icon buttons have names
□ images: meaningful alt or alt=""; figures have figcaption when captioned
□ no redundant roles; ARIA only where no native element exists; states stay in sync
□ visible :focus-visible styles; no positive tabindex; logical focus order
□ disclosure/modals/popovers use details/dialog/popover/command; not JS toggles
□ styles in @layer; no inline styles/utility soup; tokens for values
□ motion in CSS; prefers-reduced-motion respected; no JS animation for UI state
□ color is never the only signal; contrast ≥ 4.5:1 text, ≥ 3:1 large text/UI
□ html[lang]; <title>; viewport meta; color-scheme declared
```
