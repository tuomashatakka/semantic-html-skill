# ARIA & Accessibility — use native first

Digested from MDN `web/accessibility/aria/`. ARIA *supplements* HTML for
widgets/interactions that have no native element. It never changes behavior —
only the accessibility tree — so anything you assert with ARIA you must also
implement (keyboard, focus, state sync) yourself.

## The rules, in order of how often they save you

1. **First rule of ARIA: don't use ARIA.** If a native HTML element or
   attribute already has the semantics and behavior you need, use it instead of
   bolting a `role`/state onto a generic element. Native elements come with
   keyboard support, roles, and states for free.
2. **No ARIA is better than bad ARIA.** WebAIM's survey of a million home pages
   found pages *with* ARIA averaged ~41% more detected errors. Wrong ARIA
   actively misleads assistive tech — worse than none.
3. **Don't duplicate implicit roles.** Landmark elements (`<main>`, `<nav>`,
   `<header>`, `<footer>`, `<aside>`) already expose their role; adding
   `role="navigation"` to a `<nav>` is redundant noise.
4. **Don't change native semantics.** `<h2 role="tab">` breaks the heading.
   Wrap instead: `<h2><span role="tab">…</span></h2>` only if truly needed.
5. **All interactive ARIA controls must be keyboard usable**, and never put
   `role`/`aria-*`/`tabindex` on a hidden element.

## In MDN's words

> Many of these widgets are fully supported in modern browsers. **Developers should prefer using the correct semantic HTML element over using ARIA**, if such an element exists. For instance, native elements have built-in keyboard accessibility, roles and states. However, if you choose to use ARIA, you are responsible for mimicking the equivalent browser behavior in script.

> The first rule of ARIA use is "If you can use a native HTML element or attribute with the semantics and behavior you require already built in, instead of re-purposing an element and adding an ARIA role, state or property to make it accessible, then do so."

> There is a saying "No ARIA is better than bad ARIA." In WebAim's survey of over one million home pages, they found that Home pages with ARIA present averaged 41% more detected errors than those without ARIA. While ARIA is designed to make web pages more accessible, if used incorrectly, it can do more harm than good.

## Landmark element → implicit role (don't re-declare these)

| Native element | Implicit ARIA role |
| -------------- | ------------------ |
| `<header>` (page-level) | `banner` |
| `<nav>` | `navigation` |
| `<main>` | `main` |
| `<aside>` | `complementary` |
| `<footer>` (page-level) | `contentinfo` |
| `<section>` with name | `region` |
| `<form>` with name | `form` |
| `<search>` | `search` |
| `<button>` | `button` |
| `<a href>` | `link` |
| `<ul>` / `<ol>` | `list` |
| `<li>` | `listitem` |

Prefer the native element on the left. Reach for the role on the right only
when you genuinely cannot use the native element (e.g. a design system that
forces a `<div>`), and then own the full behavior in script.

## ARIA roles available in MDN (87)

`alert`, `alertdialog`, `application`, `article`, `banner`, `button`, `cell`, `checkbox`, `columnheader`, `combobox`, `command`, `comment`, `complementary`, `composite`, `contentinfo`, `definition`, `dialog`, `directory`, `document`, `feed`, `figure`, `form`, `generic`, `grid`, `gridcell`, `group`, `heading`, `img`, `input`, `landmark`, `link`, `list`, `listbox`, `listitem`, `log`, `main`, `mark`, `marquee`, `math`, `menu`, `menubar`, `menuitem`, `menuitemcheckbox`, `menuitemradio`, `meter`, `navigation`, `none`, `note`, `option`, `presentation`, `progressbar`, `radio`, `radiogroup`, `range`, `region`, `roletype`, `row`, `rowgroup`, `rowheader`, `scrollbar`, `search`, `searchbox`, `section`, `sectionhead`, `select`, `separator`, `slider`, `spinbutton`, `status`, `structurals`, `structure`, `suggestion`, `switch`, `tab`, `table`, `tablist`, `tabpanel`, `term`, `textbox`, `timer`, `toolbar`, `tooltip`, `tree`, `treegrid`, `treeitem`, `widget`, `window`

## ARIA states & properties available in MDN (53)

`aria-activedescendant`, `aria-atomic`, `aria-autocomplete`, `aria-braillelabel`, `aria-brailleroledescription`, `aria-busy`, `aria-checked`, `aria-colcount`, `aria-colindex`, `aria-colindextext`, `aria-colspan`, `aria-controls`, `aria-current`, `aria-describedby`, `aria-description`, `aria-details`, `aria-disabled`, `aria-dropeffect`, `aria-errormessage`, `aria-expanded`, `aria-flowto`, `aria-grabbed`, `aria-haspopup`, `aria-hidden`, `aria-invalid`, `aria-keyshortcuts`, `aria-label`, `aria-labelledby`, `aria-level`, `aria-live`, `aria-modal`, `aria-multiline`, `aria-multiselectable`, `aria-orientation`, `aria-owns`, `aria-placeholder`, `aria-posinset`, `aria-pressed`, `aria-readonly`, `aria-relevant`, `aria-required`, `aria-roledescription`, `aria-rowcount`, `aria-rowindex`, `aria-rowindextext`, `aria-rowspan`, `aria-selected`, `aria-setsize`, `aria-sort`, `aria-valuemax`, `aria-valuemin`, `aria-valuenow`, `aria-valuetext`

For the full role/state contract (required children, supported states, name-from), query the index: `search_mdn("<role> role aria")`.
