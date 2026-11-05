# Modern CSS architecture — layers, nesting, tokens, semantic selectors

A working reference implementation lives in `templates/styles/`: `main.css`
imports `reset`, `tokens`, `base`, `layout`, `components` and `utilities`,
one file per layer. Every rule below is used there.

## 1. Cascade layers set the order, so specificity stops mattering

Declare the order once, at the top of the entry stylesheet. A later layer
beats an earlier one **regardless of specificity**. Unlayered styles beat
every layer, so put everything in a layer.

```css
@layer reset, tokens, base, layout, components, utilities, overrides;

@import url("reset.css") layer(reset);
@import url("tokens.css") layer(tokens);
@import url("base.css") layer(base);
@import url("layout.css") layer(layout);
@import url("components.css") layer(components);
@import url("utilities.css") layer(utilities);
```

That is `templates/styles/main.css`: one file per layer, one `<link>` in the page.

| Layer | Holds | Selector style |
| --- | --- | --- |
| `reset` | box-sizing, margin resets, media defaults | `*, ::before, ::after`, `:where(…)` |
| `tokens` | custom properties only | `:root` |
| `base` | semantic element styling: typography, links, forms, tables, focus | element selectors: `h1`, `a`, `button`, `table` |
| `layout` | page and region layout | landmarks + structure: `body > header`, `main`, `.stack`, `.grid` |
| `components` | variants and composites | element + class: `button.primary`, `article.card`, `dialog > header` |
| `utilities` | a few single-purpose helpers | `.visually-hidden`, `.flow` |
| `overrides` | third-party fixes, one-offs | anything, documented |

Specificity rules:

- Wrap reset and base selectors in `:where()` so they have zero specificity
  and any component can override them.
- Use `:is()` to group without repeating, but remember it takes the highest
  specificity of its arguments.
- No `#id` selectors for styling and no `!important`, except inside
  `@layer overrides` or for user-preference guards such as reduced motion.
  Note that `!important` *reverses* layer order.

## 2. Style the semantics you already have

Select by **element → structure → state → variant class**, in that order of
preference:

```css
@layer base {
  a { color: var(--color-link); text-underline-offset: 0.2em; }
  :is(h1, h2, h3) { text-wrap: balance; line-height: var(--leading-tight); }
  table { border-collapse: collapse; inline-size: 100%; }
  th { text-align: start; }
}

@layer components {
  dialog > header { display: flex; align-items: center; gap: var(--space-sm); }
  nav[aria-label="Primary"] a[aria-current="page"] { font-weight: var(--weight-bold); }
  button[aria-expanded="true"] .chevron { rotate: 180deg; }
  form:has(:user-invalid) button[type="submit"] { opacity: 0.6; }
  article.card { container-type: inline-size; }
  button.primary { --_bg: var(--color-primary-600); }
}
```

- **Variants are classes on the element** (`button.primary`,
  `article.card.featured`). A class names a *variant*, never a look, so use
  `.danger` rather than `.red`.
- **State lives in attributes:** `[aria-expanded]`, `[aria-current]`,
  `[aria-invalid]`, `[data-state]`, `[open]`, `:popover-open`, `:checked`,
  `:user-invalid`, `:state(x)`. Don't keep an `.is-open` class in sync by
  hand.
- **No utility-class soup** and **no inline styles**. Both put presentation
  into markup (`design-system.md`).

## 3. Native nesting

```css
@layer components {
  article.card {
    padding: var(--space-md);
    border-radius: var(--radius-lg);

    & > h3 { margin-block-end: var(--space-xs); }    /* child */
    & a { color: inherit; }                          /* descendant */
    &:hover, &:focus-within { box-shadow: var(--shadow-md); }
    &.featured { border: var(--border-2) solid var(--color-primary-500); }
    .grid > & { block-size: 100%; }                  /* parent context */

    @container (inline-size > 30rem) { display: grid; grid-template-columns: 8rem 1fr; }
    @media (prefers-reduced-motion: no-preference) { transition: box-shadow var(--duration-fast) var(--ease-out); }
  }
}
```

- Keep nesting **shallow, at most 3 levels**. Deep nesting rebuilds BEM-style
  specificity chains.
- `&` is required when you attach a pseudo-class or class to the parent
  (`&:hover`, `&.featured`). Bare descendant selectors (`a { }`) work without
  it.
- Nested `@media`, `@container`, `@supports` and `@layer` all work.

## 4. Tokens as custom properties

```css
@layer tokens {
  :root {
    color-scheme: light dark;
    --color-neutral-50: oklch(98.5% 0.002 260);
    --color-neutral-900: oklch(21% 0.02 260);
    --color-primary-600: oklch(52% 0.2 262);
    --color-surface: light-dark(var(--color-neutral-50), var(--color-neutral-900));
    --color-text:    light-dark(var(--color-neutral-900), var(--color-neutral-50));
    --space-md: 1rem;
    --radius-lg: 0.75rem;
    --font-size-step-0: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
    --duration-fast: 150ms;
    --ease-out: cubic-bezier(0.2, 0, 0, 1);
  }
}
```

- Name tokens `--category-role-scale`, for example `--color-primary-600`,
  `--space-md`, `--font-size-step-2`, `--shadow-lg`, `--duration-fast`. See
  `design-system.md` for the full taxonomy.
- Use **two tiers**: primitive tokens (the scales) feed semantic tokens
  (`--color-surface`, `--color-text`, `--color-link`). Components use
  semantic tokens only.
- **Component-private custom properties** use an underscore:
  `button { --_bg: var(--color-surface); background: var(--_bg); }`. A
  variant changes only `--_bg`.
- Register typed properties with `@property` when you need to animate them
  or want a guaranteed fallback.

```css
@property --_progress { syntax: "<percentage>"; inherits: false; initial-value: 0%; }
```

## 5. Color and theming

- Declare `color-scheme: light dark` on `:root`. That gives you native dark
  form controls and scrollbars, and enables `light-dark()`.
- Use `light-dark(lightValue, darkValue)` for semantic tokens, so you don't
  need to duplicate them under `@media (prefers-color-scheme)`.
- Offer a user override with `:root[data-theme="dark"] { color-scheme: dark; }`.
  Because `light-dark()` follows `color-scheme`, nothing else has to change.
- Define palettes in `oklch()`, which keeps steps perceptually even. Derive
  states with `color-mix(in oklch, var(--c) 85%, black)` or relative colors
  (`oklch(from var(--c) calc(l - 0.1) c h)`).
- Set `accent-color` to theme native checkboxes, radios and range inputs.
  MDN marks it **limited**, so treat it as an enhancement.
- Contrast must be at least 4.5:1 for body text and 3:1 for large text, UI
  components and focus indicators (WCAG 2.2 AA).

## 6. Layout and sizing

- **Logical properties everywhere:** `margin-block`, `padding-inline`,
  `inset-inline-start`, `inline-size`, `border-start-start-radius`. They work
  in RTL and vertical writing modes for free.
- **Mobile-first:** base styles are the narrow layout, and you enhance with
  `@media (width >= 48rem)` (range syntax).
- **Container queries for components** and media queries for the page.
  Declare `container-type: inline-size` on the component wrapper.
- Use **fluid type and space** with `clamp(min, preferred, max)`, and always
  include a `rem` term so zoom works.
- Prefer Grid and Flex with `gap` over margins between siblings, and use
  `subgrid` to align card internals.
- Use `aspect-ratio`, `object-fit` and `min()`/`max()` instead of JS
  measuring.
- Use `scrollbar-gutter: stable` to stop layout shift when a modal locks
  scrolling.

## 7. Focus, interaction and preference queries

```css
@layer base {
  :focus-visible { outline: var(--border-2) solid var(--color-focus); outline-offset: 2px; }
  :where(button, a, input, select, textarea, summary) { touch-action: manipulation; }
  @media (prefers-reduced-motion: reduce) {
    *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  }
  @media (forced-colors: active) { :focus-visible { outline-color: Highlight; } }
  @media (prefers-contrast: more) { :root { --color-border: var(--color-neutral-900); } }
}
```

- Never remove focus outlines without a `:focus-visible` replacement.
- Respect `prefers-reduced-motion`, `prefers-contrast`, `forced-colors` and
  `prefers-reduced-transparency`.
- Interactive targets should be at least 24×24 CSS px (WCAG 2.2 Target
  Size), and 44×44 is better for touch.

## 8. Scoping components

- Use **`@scope`** (Baseline newly available since 2026-03) to scope a
  component's styles with a lower boundary, so they don't leak into slotted
  or nested content:

```css
@scope (article.card) to (.card-content) {
  :scope { border-radius: var(--radius-lg); }
  img { border-radius: inherit; }
}
```

- Otherwise rely on element and class selectors inside layers. Avoid
  CSS-in-JS runtime injection, and if a framework scopes styles for you, keep
  the same layer discipline.

## 9. Performance

- Keep render-blocking CSS small. Use plain `<link rel="stylesheet">` per
  route or feature rather than JS-injected styles, and avoid the
  `media="print" onload` hack, which needs JS.
- Use `content-visibility: auto` with `contain-intrinsic-size` for long
  off-screen sections.
- Animate only `transform`, `opacity`, `filter` and `clip-path`, which are
  compositor-friendly (`motion.md`).
- Avoid expensive `:has()` chains on huge DOMs (`body:has(...)` that
  re-evaluates often), and keep `:has()` arguments specific.

Deep lookups: `search_mdn "…" --prefix Web/CSS`, or `get_mdn_page` with a
property slug such as `Web/CSS/Reference/At-rules/@layer`.
