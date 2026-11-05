# Forms — labels, types, autocomplete, validation, errors

Templates: `templates/forms-sign-in.html`, `forms-sign-up.html`,
`forms-contact.html`, `forms-search.html`, `forms-choices.html`.

## Structure

```html
<form action="/subscribe" method="post">
  <fieldset>
    <legend>Contact details</legend>
    <p>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="email" required
             aria-describedby="email-hint">
      <small id="email-hint">We'll never share it.</small>
    </p>
  </fieldset>
  <button type="submit">Subscribe</button>
</form>
```

- **Every control has a programmatic label**: `<label for=id>`, or the
  control wrapped in a `<label>`. A placeholder is not a label.
- **Use groups:** `<fieldset>` + `<legend>` for radios, checkboxes and
  related fields such as an address.
- **Hints and errors** are linked with `aria-describedby` (several ids are
  allowed, separated by spaces).
- **Buttons** are `<button type="submit">` or `type="button"`. Never use a
  `<div>`, and never leave out `type` inside a form.
- **Required fields** use `required`, and show it visibly with "(required)"
  in the label or a legend note, not just `*`.

## Choose the right input type

| Data | Markup | Gains |
| --- | --- | --- |
| Email | `type="email" autocomplete="email"` | validation, @ keyboard |
| Phone | `type="tel" autocomplete="tel"` | dial pad (no validation, since formats vary) |
| URL | `type="url"` | validation, .com keyboard |
| Integer/amount | `type="number"`, or `inputmode="numeric"` + `pattern` for IDs/PINs | numeric pad; avoid `number` for card numbers and zip codes |
| Search | `type="search"` inside `<search>` | clear button, search landmark |
| Password | `type="password" autocomplete="current-password"` / `"new-password"` | password managers |
| One-time code | `inputmode="numeric" autocomplete="one-time-code"` | SMS autofill |
| Date / time | `type="date"`, `time`, `datetime-local`, `month`, `week` | native pickers |
| Choice of 2–5 | radios in a `<fieldset>` | all options visible |
| Choice of many | `<select>` (+ `<optgroup>`), or `<input list>` + `<datalist>` for suggestions | |
| On/off setting | `<input type="checkbox" role="switch">` | switch semantics on a native control |
| Range | `type="range"` + `<output>` | |
| Color | `type="color"` | |
| File | `type="file" accept="image/*"` (+ `capture`) | |
| Long text | `<textarea>` with `field-sizing: content` for auto-grow | |

## `autocomplete` tokens (the common ones)

`name`, `given-name`, `family-name`, `nickname`, `email`, `username`,
`new-password`, `current-password`, `one-time-code`, `organization`,
`organization-title`, `street-address`, `address-line1`, `address-line2`,
`address-level2` (city), `address-level1` (state), `postal-code`, `country`,
`country-name`, `tel`, `tel-national`, `bday`, `sex`, `url`, `photo`,
`cc-name`, `cc-number`, `cc-exp`, `cc-csc`, `cc-type`,
`transaction-amount`, `language`.

You can prefix a section (`section-billing`) and `shipping`/`billing`, as in
`autocomplete="shipping postal-code"`. Use `autocomplete="off"` only for
genuinely non-personal fields; browsers ignore it for credentials. WCAG 1.3.5
asks for correct tokens on fields that collect the user's own data.

## Validation: native first

```html
<input id="zip" name="zip" inputmode="numeric" pattern="[0-9]{5}" required
       autocomplete="postal-code" aria-describedby="zip-err">
<p id="zip-err" class="error">Enter a 5-digit ZIP code.</p>
```

```css
@layer components {
  input:user-invalid { border-color: var(--color-error-700); }
  /* Error text is hidden until the field is invalid after interaction — pure CSS.
     It stays wired via aria-describedby, so AT reads it when the field is focused. */
  .error { display: none; }
  input:user-invalid + .error,
  :has(> input:user-invalid) > .error { display: block; }
  form:has(:user-invalid) [type="submit"] { --_bg: var(--color-neutral-400); }
}
```

- `:user-invalid` / `:user-valid` (Baseline widely available, 2026-05)
  only match *after the user interacts*, so there are no red fields on page
  load.
- Use constraint attributes: `required`, `pattern`, `min`/`max`/`step`,
  `minlength`/`maxlength`, `type`.
- Add JS only for cross-field or server checks. Then call
  `input.setCustomValidity(msg)` and `form.reportValidity()` so the native
  UI and AT announcements still work. Set `aria-invalid="true"` and make sure
  the error text is linked with `aria-describedby`.
- On submit failure, move focus to the first invalid field, or to an error
  summary at the top that links to each field.
- `novalidate` on `<form>` turns off native bubbles. If you set it, you take
  over error messages *and* focus management yourself.

## Error message pattern

```html
<p>
  <label for="pw">Password <small>(required, 12+ characters)</small></label>
  <input id="pw" name="pw" type="password" autocomplete="new-password"
         minlength="12" required aria-invalid="true" aria-describedby="pw-err">
  <span id="pw-err" class="error" role="status">Password must be at least 12 characters.</span>
</p>
```

- Tell users **what went wrong and how to fix it**, next to the field.
- Use an icon *and* text, never color alone.
- Error summary: a `role="alert"` region, or focus moved to a heading inside
  it, listing `<a href="#field-id">` links to each field.

## Don'ts

- Placeholder-only labels, or floating labels that hide the value.
- Disabled submit buttons as the only feedback (users can't find out why).
- Splitting phone, date or card numbers into several inputs without a reason.
- Auto-advancing focus between fields.
- CAPTCHA without an accessible alternative.
- Clearing the form on error.
