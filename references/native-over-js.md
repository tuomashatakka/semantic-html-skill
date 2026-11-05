# HTML/CSS over JS(X)

**The default is to reach for the platform first.** Native elements,
attributes and CSS selectors arrive accessible: keyboard support, focus
management, top layer, AT semantics, browser-native state, and no runtime
cost. JS is for *behaviour the platform doesn't have*, not for re-creating
the behaviour it does have.

Each row gives a Baseline status from MDN as of the 2026-11 build. "Newly" means
it has worked in all core browsers for under 30 months, so check your support
matrix. "Limited" means you must treat it as progressive enhancement with a
fallback.

## Replace JS with the platform

| You were going to write… | Use instead | Baseline |
| --- | --- | --- |
| click handler that toggles `.open` on a panel | `<details>` + `<summary>` | widely |
| accordion where only one panel is open | `<details name="group">` (exclusive) | newly (2024-09) |
| "find in page" can't reach collapsed content | `hidden="until-found"` / closed `<details>` are searchable | check the compat table |
| modal: focus trap, Esc, backdrop, scroll lock | `<dialog>` + `showModal()`; `::backdrop`; `inert` comes free | widely |
| open/close buttons wired with JS | `<button command="show-modal" commandfor="dlg">`, `command="close"` / `"request-close"` | newly (2025-12) |
| light-dismiss rules for a dialog | `<dialog closedby="any \| closerequest \| none">` | **limited** |
| form inside a modal that closes on submit | `<form method="dialog">` (the submit button's `value` becomes `returnValue`) | widely |
| dropdown, menu, toast, tooltip with outside-click close | `popover` attribute + `popovertarget` or `command="toggle-popover"` | widely (2026-10) |
| hover/focus tooltips that don't close menus | `popover="hint"` | **limited** |
| JS positioning of tooltips/menus (Popper, Floating UI) | CSS anchor positioning: `anchor-name`, `position-anchor`, `position-area`, `anchor()` | newly (2026-01…09) |
| "is the parent in state X" via JS class sync | `:has()` (e.g. `form:has(:user-invalid)`, `li:has(> a[aria-current])`) | widely (2026-06) |
| validation and error styling after the user interacts | `required`, `pattern`, `type=email`; `:user-invalid` / `:user-valid` | widely (2026-05) |
| JS character counter that auto-grows a textarea | `field-sizing: content` | newly (2026-06) |
| tabs or sections via hash routing | `:target` (or real anchors with `scroll-margin-top`) | widely |
| skip-to-content script | `<a href="#main" class="skip">` + `:focus-visible` styling | widely |
| responsive component via ResizeObserver | container queries `@container (inline-size > 40rem)` | widely (2025-08) |
| theme switching via JS class swapping | `color-scheme: light dark` + `light-dark()` + `prefers-color-scheme` | newly / widely |
| computed tints or shades in JS | `color-mix(in oklch, var(--c) 80%, white)`, relative colors | widely |
| "make it readable" contrast calculation | `contrast-color()` | newly (2026-04) |
| balancing headline lines | `text-wrap: balance` / `pretty` | widely |
| smooth scrolling | `scroll-behavior: smooth` (guard it with reduced motion) | widely |
| carousel scroll physics | `scroll-snap-type` / `scroll-snap-align` | widely |
| scroll-linked progress or reveal (IntersectionObserver + rAF) | `animation-timeline: scroll() / view()` | newly (2026-10) |
| enter/exit animation for dialogs and popovers | `@starting-style` + `transition-behavior: allow-discrete` on `display`/`overlay` | newly / **limited** |
| JS measuring `scrollHeight` to animate height: auto | `interpolate-size: allow-keywords` / `calc-size()`; `::details-content` | **limited** / newly |
| page transitions (SPA router animation) | View Transitions: `document.startViewTransition()`, `@view-transition { navigation: auto }` | newly / **limited** (cross-document) |
| lazy rendering of off-screen sections | `content-visibility: auto` + `contain-intrinsic-size` | newly |
| lazy images | `<img loading="lazy" decoding="async">`, `fetchpriority` | widely |
| responsive images via JS | `<picture>`, `srcset` + `sizes` | widely |
| custom select from divs | `<select>`; **customizable select** (`appearance: base-select`, `::picker(select)`, `<selectedcontent>`) as an enhancement | **limited** |
| autocomplete suggestions | `<input list>` + `<datalist>` | widely |
| progress bar or gauge from divs | `<progress>`, `<meter>` | widely |
| live result of a calculation | `<output for="a b">` (implicit `status`) | widely |
| disabling a whole region while busy | `inert` | widely |
| custom element states via classes | `ElementInternals.states` + `:state(name)` | newly (2024-05) |
| loading-state UI shown only when JS is off or on | `@media (scripting: none)` | widely |

## JSX / component rules

Components are a way to **package semantic HTML**. They don't replace it.

1. **Render the semantic element.** `<Button>` renders `<button>`,
   `<Card>` renders `<article>`, `<Nav>` renders `<nav>`. Never render a
   `<div>` with an `onClick`.
2. **Props carry meaning and behaviour, not appearance.** Use
   `variant: "primary" | "secondary"`, `size`, `type`, `href`, `disabled`.
   Don't take `color`, `padding`, `margin`, `className` or `style` props for
   design values. Passing through native attributes (`...rest`) is fine.
3. **Expose state as attributes and let CSS react to it.** Use
   `aria-expanded`, `aria-current`, `aria-invalid`, `data-state="loading"`,
   or `:state()` for custom elements. Then write
   `button[aria-expanded="true"] { … }` rather than computing class strings.
4. **Keep the native controller.** Use `<dialog ref>` with
   `ref.current.showModal()`, or better, `command`/`commandfor` with no JS at
   all. Keep `<details open>` uncontrolled where you can. Use `<form action>`
   with native validation.
5. **Animation lives in CSS.** No motion library for hover, enter/exit,
   accordion or page transitions (`motion.md`). React to state with
   `@starting-style` and transitions on `[open]`, `:popover-open` and
   `[data-state]`.
6. **Composition over configuration.** A `<Card>` that takes children
   (`<Card><h3>…</h3><p>…</p></Card>`) beats one with fifteen props.
7. **Semantic defaults.** `type="button"` unless told otherwise, the correct
   heading level as a prop (`as="h2"`), and a required `alt`/label prop.

```tsx
// ✗ div soup, appearance props, JS state for what CSS can do
<div className="btn btn-blue px-4" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>Menu</div>
{open && <div className="menu fade-in">…</div>}

// ✓ semantic element, behaviour from the platform, styling from CSS
<button type="button" popoverTarget="site-menu" className="primary">Menu</button>
<nav id="site-menu" popover="auto" aria-label="Site">…</nav>
```

See `templates/jsx/` for Button, Dialog, Disclosure, Field and Card.

## When you still need JS

- Composite widgets with no native element: tabs, tree, grid, combobox and
  toolbar (roving `tabindex`, arrow keys). See `aria.md`.
- Data fetching, optimistic UI, persisting state, routing.
- Gesture-driven or physics-based motion, choreographed sequences, and
  interruptible animations that must read layout. Use the **Web Animations
  API** (`el.animate()`) rather than a library, and still honour
  `prefers-reduced-motion`.
- Polyfilling or progressively enhancing a **limited** feature from the table
  above. Feature-detect with `@supports` or `'commandForElement' in
  HTMLButtonElement.prototype`, and keep the native fallback usable.

Even then, keep **state in the DOM** (attributes), **presentation in CSS**,
and make **JS only flip state**.
