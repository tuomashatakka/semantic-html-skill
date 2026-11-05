# Accessibility essentials (WCAG 2.2 AA)

Semantic HTML gets you about 80% of the way. This file covers the rest.

## Document

- `<html lang="en">`, and `lang` on any passage in another language.
- A unique, descriptive `<title>` in the form "Page – Site".
- `<meta name="viewport" content="width=device-width, initial-scale=1">`.
  Never set `maximum-scale` or `user-scalable=no`.
- Exactly one `<main id="main">`, plus a **skip link** as the first
  focusable element:

```html
<a class="skip-link" href="#main">Skip to content</a>
```

```css
.skip-link:not(:focus-visible) { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
```

## Headings and structure

- One `<h1>`, with levels in order and no skips. Headings name sections.
- Use landmarks: `header`, `nav`, `main`, `aside`, `footer`, `search`,
  plus a labelled `section` or `form` when it deserves to be a region.
- Lists for lists. Tables for tabular data, with `<caption>`, `<th scope>`,
  and `headers` for complex tables.

## Images and media

| Image is… | `alt` |
| --- | --- |
| informative | a concise description of the information, not of the pixels |
| functional (the only content of a link or button) | the action or destination ("Search", "Home") |
| decorative | `alt=""` (and no `title`) |
| complex (a chart) | short `alt` plus a longer description in a `<figcaption>`, nearby text, or a table |
| text in an image | the same text |

- Inline SVG icons: put `aria-hidden="true" focusable="false"` on the SVG
  and name the control instead. Meaningful SVG gets `role="img"` +
  `aria-label` or `<title>`.
- Video needs captions (`<track kind="captions">`), with transcripts and
  audio description where relevant. No autoplay with sound, and add a pause
  control for anything that moves for more than 5 seconds.

## Keyboard and focus

- Everything operable by pointer is operable by keyboard, in a logical
  order (DOM order equals visual order; watch out for `order` and grid
  placement).
- Use a visible `:focus-visible` indicator with at least 3:1 contrast, and
  don't let it be obscured by sticky headers (`scroll-padding-block-start`).
- No keyboard traps, except for an intentional modal, which `<dialog>`
  handles for you.
- After a modal closes, focus returns to the element that opened it.
  `<dialog>` and `command` do this natively.
- Route changes in a SPA: move focus to the new `<h1>`, or announce the page
  title in a live region.
- Only use `tabindex="0"` (custom focusable) and `tabindex="-1"`
  (programmatic focus target). Never use positive values.
- Remove whole regions from interaction with `inert`, not with
  `aria-hidden` + `tabindex` juggling.

## Color, contrast, sensory

- Text contrast at least 4.5:1, or 3:1 for text ≥ 24px or bold ≥ 18.66px.
  UI components, focus rings and graph lines at least 3:1.
- Never use color as the only signal (errors, links in body text, chart
  series). Add an underline, an icon or text.
- Support `forced-colors: active` by using system colors (`CanvasText`,
  `Highlight`) for custom focus and borders.
- Respect `prefers-reduced-motion`, `prefers-contrast` and
  `prefers-color-scheme`.

## Pointer and touch

- Targets at least 24×24 CSS px, or adequately spaced (2.5.8). 44×44 is
  better for touch.
- No path-based or multi-point gestures without a single-pointer
  alternative. Dragging needs a click alternative (2.5.7).
- Actions fire on pointer-up/click, not on pointer-down.

## Content

- Link text makes sense out of context. Buttons start with verbs.
- Error messages explain how to fix the problem (`forms.md`).
- Make content readable: plain language, short paragraphs, a meaningful
  heading for each block.
- Time limits can be extended. Auto-updating content can be paused.

## Dynamic updates

- Status messages go in `role="status"` / `<output>`. Use `role="alert"` for
  urgent errors only. The region must exist before you update it.
- Loading state: `aria-busy="true"` on the region, and a visually hidden
  "Loading…" in a status region.
- Never steal focus on content updates unless the user triggered them.

## Testing

1. **Automated** tools catch about 30–40%: axe-core (`@axe-core/playwright`,
   jest-axe), Lighthouse CI, html-validate (`npm run check:templates`).
2. **Keyboard pass:** Tab through everything. Is focus visible? Is the order
   logical? Can you get out of everything? Does Esc close overlays?
3. **Screen reader pass:** VoiceOver (macOS/iOS), NVDA (Windows), TalkBack
   (Android). Check the heading list, the landmarks list, the links list and
   form labels.
4. **Zoom to 400%** and use a 320px viewport: nothing should need
   horizontal scrolling, except data tables.
5. **Forced colors and reduced motion** emulated in DevTools.
