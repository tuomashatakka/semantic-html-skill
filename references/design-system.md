# Design-system concepts (after the Semantic Nodes style guide)

Adapted from the **Semantic Nodes Design System Guide**
(<https://semantic-nodes.vercel.app/style-guide/>). Its core idea is
**meaning over appearance**: HTML provides structure, CSS provides
presentation, and JS provides behaviour, and none of the three leaks into
another. Where the guide has gaps or contradicts itself, the gap is noted and
fixed here (see the end of this file).

## Core principles

1. **Semantic HTML5 first.** Every component renders the native element that
   matches its meaning: `<button>`, `<main>`, `<dialog>`, `<article>`,
   `<nav>`, `<header>`, `<input>` with a `<label>`. Never a `<div>` with a
   role, if a native element exists.
2. **Minimal component interfaces.** Props describe *what* and *how it
   behaves*, never *how it looks*.
3. **CSS-driven styling.** Element selectors give base styles, variant classes
   on the element give variations, and structural selectors express
   relationships.

## Anti-patterns the system rejects

| Anti-pattern | Example | Instead |
| --- | --- | --- |
| Utility-class proliferation | `<button class="bg-blue-500 px-4 py-2 rounded text-white">` | `<button class="primary">` styled in `components` |
| Non-semantic markup | `<div class="button" onclick>` | `<button type="button">` |
| Inline styling | `<p style="color:red">`, `style={{…}}` in JSX | a token-backed rule in a layer |

## Design tokens

Tokens are the only source of raw values. They are written once (Style
Dictionary or plain CSS) and emitted as CSS custom properties, plus JS/TS
when scripts need them. The naming pattern is **`--category-role-scale`**.

| Category | Tokens | Notes |
| --- | --- | --- |
| Color, base | `--color-white`, `--color-black`, `--color-transparent` | |
| Color, neutral | `--color-neutral-50 … 950` | text, surfaces, borders |
| Color, primary | `--color-primary-50 … 950` | brand. `600` is the default action color |
| Color, semantic | `--color-success-{50,500,700}`, `--color-warning-…`, `--color-error-…`, `--color-info-…` | always paired with text or an icon, never color alone |
| Font family | `--font-family-sans`, `-serif`, `-mono` | |
| Font size | `--font-size-xs … 5xl` (rem; fluid with `clamp()`) | headings map onto these |
| Font weight | `--font-weight-thin` (100) … `-black` (900) | |
| Line height | `--line-height-none`, `-tight`, `-snug`, `-normal`, `-relaxed`, `-loose` | |
| Spacing | `--spacing-xs`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl` … | one scale for padding, gap and margin |
| Border width | `--border-width-0`, `-1`, `-2`, `-4`, `-8` | |
| Radius | `--radius-none`, `-sm`, `-md`, `-lg`, `-xl`, `-full` | `full` makes pills |
| Shadow | `--shadow-sm`, `-md`, `-lg`, `-xl`, `-2xl` | elevation levels |
| Breakpoint | `--breakpoint-phone` (480px), `--breakpoint-tablet` (1280px) | custom properties can't go in `@media`, so mirror them as literal values or use `@custom-media` in a build step |
| **Motion** *(added)* | `--duration-fast`, `-base`, `-slow`; `--ease-out`, `-in-out`, `-spring` | see `motion.md` |
| **Focus** *(added)* | `--color-focus`, `--focus-ring-width`, `--focus-ring-offset` | |

**Two tiers.** The primitive scales above feed *semantic* tokens such as
`--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`,
`--color-link` and `--color-action`. Components consume only the semantic
tokens, which is what makes theming a one-place change
(`templates/styles/tokens.css`).

## Component classification

| Class | What it is | Renders | Examples |
| --- | --- | --- | --- |
| **Atomic** | one element, one job | a single native element | Button → `<button>`, Heading → `<h1>`–`<h6>`, Input → `<input>` + `<label>`, Text → `<p>` |
| **Molecular** | a composite of atoms | a small semantic structure | SearchField → `<search>` › `<form>` › `<label>` + `<input type=search>` + `<button>`, Card → `<article>` › heading + body + `<footer>` |
| **Layout view** | page regions | landmarks | HeaderView → `<header>`, MainView → `<main>`, ModalView → `<dialog>` |

## Component interface rules

- **Minimal and meaningful.** Each prop changes semantics or behaviour:
  `variant`, `size`, `type`, `level`, `href`, `disabled`, `required`.
- **Semantic defaults.** `type="button"`, sensible heading `level`,
  `variant` defaulting to a neutral look rather than `null` magic.
- **Type safety.** Use union types (`variant?: "primary" | "secondary" |
  "danger"`), and never `string` for a closed set.
- **No appearance props:** no `color`, `padding`, `margin`, `className`
  overrides or `style`. Design changes go through tokens or a new *variant*.
- **Composition over configuration.** Children and slots beat flags.
- **Single responsibility.** A Card doesn't fetch data, and a Button doesn't
  route.
- **Map props to classes and attributes,** not inline styles. A small
  `classNames`-style helper can map `variant="primary"` to
  `class="primary"`; state maps to `aria-*` or `data-*`.

```ts
interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
}
```

## Styling methodology

- **Base element styling** happens in `@layer base`, where `button`,
  `input`, `h1`–`h6`, `a` and `table` all look right with no classes.
- **Component variant styling** happens in `@layer components`, with
  selectors like `button.primary`, `button.danger` and `article.card`.
- **Semantic structure styling** uses structural selectors such as
  `dialog > header`, `article > footer`, `nav ul` and
  `form fieldset + fieldset`.
- **Mobile first.** Base styles are for a phone, and `min-width` (range
  syntax `width >=`) queries enhance from there. Components use container
  queries.
- **Layers.** The guide uses `base → components → utilities`, plus
  `critical`/`deferred` for loading. This skill extends that to
  `reset, tokens, base, layout, components, utilities, overrides`
  (`css.md`).

## Accessibility standard

- **WCAG 2.1 AA at minimum** (prefer 2.2 AA, which adds focus-not-obscured,
  target size and more). Contrast is 4.5:1 for normal text and 3:1 for large
  text and UI.
- Use a correct heading hierarchy, landmarks, labels and fieldsets, and
  table headers.
- Use ARIA only where native semantics are missing (`aria.md`).
- **Keyboard:** Enter/Space activates, Esc closes, arrow keys move within
  composites, and focus is trapped in modals. With `<dialog>.showModal()`,
  the browser does the trapping and Esc handling for you, so don't
  hand-roll it.
- **Testing:** run axe (jest-axe / @axe-core) in unit tests, Lighthouse CI,
  and a manual keyboard + screen-reader pass (`accessibility.md`).

## Gaps in the source guide, fixed here

| Guide issue | Resolution in this skill |
| --- | --- |
| Some referenced tokens are never defined (`--font-size-base`, `--spacing-6`, `--breakpoint-2xl`) | One consistent token set in `templates/styles/tokens.css` |
| Some examples use inline `style` props, contradicting "no inline styling" | Templates never use inline styles; html-validate enforces `no-inline-style` |
| No reduced-motion guidance; transitions hard-coded at `0.2s ease` | Motion tokens plus `prefers-reduced-motion` (`motion.md`) |
| No dark mode or theming | `color-scheme` + `light-dark()` semantic tokens, with a `[data-theme]` override |
| Focus trapping and keyboard handling written in JS for modals | Native `<dialog>` + `command`/`commandfor` (`native-over-js.md`) |
| Breakpoints as custom properties used in `@media` | Not possible in CSS: use literal values or a `@custom-media` build step |
| Contrast figure for `#a3a3a3` on white (about 2.5:1) understated | Never use it for text; muted text should be neutral-600 or darker on white |
