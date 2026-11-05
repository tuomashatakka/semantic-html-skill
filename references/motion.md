# Motion — CSS transitions and animations before JS

**Default: animate in CSS.** CSS animations run off the main thread where they
can, survive hydration, respect `prefers-reduced-motion` from one place, and
need no library. Reach for JS (the Web Animations API) only for motion that CSS
can't express (see the end of this file).

Baseline status is from MDN as of the 2026-11 build.

## Ground rules

1. **Animate cheap properties.** `transform` (`translate`, `scale`,
   `rotate`), `opacity`, `filter` and `clip-path` run on the compositor.
   Avoid animating `width`, `height`, `top`/`left` and `margin`, which trigger
   layout.
2. **Use motion tokens.** Durations and easings come from tokens
   (`--duration-fast: 150ms`, `--duration-base: 250ms`,
   `--duration-slow: 400ms`, `--ease-out`, `--ease-in-out`, `--ease-spring`
   via `linear()`). No magic numbers.
3. **Opt in to motion** by wrapping decorative motion in
   `@media (prefers-reduced-motion: no-preference) { … }`, or keep a global
   reduce guard (`css.md` §7). Under reduced motion, use opacity
   cross-fades instead of movement. Don't just remove all feedback.
4. **Drive animation from state.** Transition on `[open]`, `:popover-open`,
   `[aria-expanded="true"]`, `[data-state="…"]` or `:checked`. JS only flips
   the attribute, or nothing flips it at all when you use
   `command`/`popover`/`<details>`.
5. **Keep UI feedback short:** 100–300 ms for UI and up to about 500 ms for
   large surfaces. Never block interaction while an animation runs.

## Transitions on state

```css
@layer components {
  button.primary {
    transition: background-color var(--duration-fast) var(--ease-out),
                scale var(--duration-fast) var(--ease-out);
    &:hover { background-color: var(--color-primary-700); }
    &:active { scale: 0.97; }
  }
}
```

## Enter/exit for dialogs and popovers: `@starting-style` + `allow-discrete`

`display` and `overlay` are discrete properties. `transition-behavior:
allow-discrete` keeps the element rendered while it animates out, and
`@starting-style` supplies the "before" state for the entry animation.

- `@starting-style`: Baseline **newly** available (2024-08).
- `transition-behavior`: **limited** on MDN. Without it, the exit simply
  isn't animated, which is a safe fallback.

```css
@layer components {
  dialog, [popover] {
    opacity: 0;
    translate: 0 0.5rem;
    transition: opacity var(--duration-base) var(--ease-out),
                translate var(--duration-base) var(--ease-out),
                display var(--duration-base) allow-discrete,
                overlay var(--duration-base) allow-discrete;

    &:is([open], :popover-open) {
      opacity: 1;
      translate: 0 0;
      @starting-style { opacity: 0; translate: 0 0.5rem; }
    }
  }

  dialog::backdrop {
    background: oklch(0% 0 0 / 0);
    transition: background-color var(--duration-base), display var(--duration-base) allow-discrete,
                overlay var(--duration-base) allow-discrete;
  }
  dialog[open]::backdrop {
    background: oklch(0% 0 0 / 0.5);
    @starting-style { background: oklch(0% 0 0 / 0); }
  }
}
```

## Accordion height: `::details-content` + `interpolate-size`

- `::details-content` is Baseline **newly** available (2025-09).
- `interpolate-size` and `calc-size()` are **limited**. Without them the
  panel opens instantly, which is fine.

```css
@layer components {
  :root { interpolate-size: allow-keywords; }  /* opt the page in to animating to/from `auto` */

  details::details-content {
    block-size: 0;
    overflow: clip;
    transition: block-size var(--duration-base) var(--ease-out),
                content-visibility var(--duration-base) allow-discrete;
  }
  details[open]::details-content { block-size: auto; }

  summary::marker { content: ""; }
  summary::after { content: "▸"; transition: rotate var(--duration-fast); }
  details[open] > summary::after { rotate: 90deg; }
}
```

## Keyframes for loops and attention

```css
@keyframes spin { to { rotate: 1turn; } }
@keyframes pulse { 50% { opacity: 0.5; } }

[aria-busy="true"] .spinner { animation: spin 0.8s linear infinite; }

@media (prefers-reduced-motion: reduce) {
  [aria-busy="true"] .spinner { animation: pulse 1.5s ease-in-out infinite; }  /* no rotation */
}
```

Use `animation-composition`, `animation-fill-mode: both` and
`animation-play-state` (for example paused on `:hover`) before reaching for
JS control.

## Scroll-driven animations (no IntersectionObserver, no scroll listeners)

`animation-timeline`, `scroll()`, `view()` and `scroll-timeline` are Baseline
**newly** available (2026-10). Guard them with `@supports` if you support
older browsers.

```css
@layer components {
  /* reading-progress bar */
  .progress {
    position: fixed; inset: 0 0 auto; block-size: 3px; transform-origin: 0 50%;
    background: var(--color-primary-600);
    animation: grow linear both;
    animation-timeline: scroll(root block);
  }
  @keyframes grow { from { scale: 0 1; } to { scale: 1 1; } }

  /* reveal on enter */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      main > section {
        animation: reveal linear both;
        animation-timeline: view();
        animation-range: entry 0% cover 30%;
      }
    }
  }
  @keyframes reveal { from { opacity: 0; translate: 0 2rem; } }
}
```

## View transitions (page and state changes)

- Same-document: `document.startViewTransition(update)` is Baseline **newly**
  available (2025-10). The pseudo-elements `::view-transition-*` and
  `view-transition-name` are newly available as well.
- Cross-document (MPA): `@view-transition { navigation: auto; }` is
  **limited**. Browsers without it navigate normally.

```css
@layer components {
  @view-transition { navigation: auto; }               /* MPA: opt in on both pages */
  main > h1 { view-transition-name: page-title; }      /* shared-element morph */
  ::view-transition-old(root), ::view-transition-new(root) { animation-duration: var(--duration-base); }
  @media (prefers-reduced-motion: reduce) { ::view-transition-group(*) { animation: none; } }
}
```

```js
// SPA: JS only swaps the DOM; CSS animates it
if (!document.startViewTransition) updateDom();
else document.startViewTransition(updateDom);
```

## Easing tokens

```css
:root {
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: linear(0, 0.38 9%, 0.86 20%, 1.06 31%, 1.09 38%, 1.03 52%, 0.99 66%, 1);
}
```

`linear()` with many stops approximates springs and bounces in pure CSS, so you
don't need a physics library for UI micro-interactions.

## When JS animation is justified

- **Gesture-driven or interruptible motion** that follows a pointer:
  drag-to-dismiss sheets, swipe carousels with momentum.
- **Physics** that must react to live velocity.
- **Choreography** that depends on runtime layout measurements (FLIP
  between arbitrary DOM positions), when view transitions don't fit.
- **Canvas, WebGL and SVG path morphing** beyond what CSS can interpolate.

Even then, use the **Web Animations API** (`el.animate(keyframes,
{ duration, easing })`) rather than a library. It runs on the same engine
as CSS animations, can be cancelled, and returns a `finished` promise.
Check `matchMedia("(prefers-reduced-motion: reduce)")` first. Keep the
resting states in CSS so the UI is correct when JS fails.

Deep lookups: `search_mdn "allow-discrete display transition"`, or
`get_mdn_page Web/CSS/Reference/At-rules/@starting-style`.
