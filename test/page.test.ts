import assert from "node:assert/strict";
import { test } from "node:test";
import { baselineLabel, definitions, pickSections, section, slugFromUrl, technicalSummary, toPage } from "../src/mdn/page.ts";
import { chunkPage } from "../src/search/chunk.ts";

const raw = {
  title: "<x-demo> HTML demo element",
  short_title: "<x-demo>",
  summary: "The <x-demo> element demonstrates things.",
  mdn_url: "/en-US/docs/Web/HTML/Reference/Elements/x-demo",
  baseline: { baseline: "low" as const, baseline_low_date: "2025-09-16" },
  body: [
    { type: "prose", value: { id: null, content: "<p>The <code>&lt;x-demo&gt;</code> element demonstrates things at length. ".repeat(4) + "</p>" } },
    {
      type: "prose",
      value: {
        id: "attributes",
        title: "Attributes",
        content:
          '<dl><dt id="mode"><code>mode</code></dt><dd><p>Sets the mode. More text.</p><dl><dt><code>fast</code></dt><dd><p>Nested value.</p></dd></dl></dd>' +
          '<dt id="old"><code>old</code> <span class="icon icon-deprecated"></span></dt><dd><p>Legacy.</p></dd></dl>',
      },
    },
    { type: "prose", value: { id: "accessibility", title: "Accessibility", content: "" } },
    { type: "prose", value: { id: "naming", title: "Naming <code>it</code>", isH3: true, content: "<p>" + "Give it a name. ".repeat(20) + "</p>" } },
    { type: "prose", value: { id: "examples", title: "Examples", content: "<p>Example.</p>" } },
    {
      type: "prose",
      value: {
        id: "technical_summary",
        title: "Technical summary",
        content:
          '<table class="properties"><tbody><tr><th scope="row"><a href="#">Content categories</a></th><td>Flow content, phrasing content</td></tr>' +
          '<tr><th scope="row">Permitted ARIA roles</th><td><ul><li><code>button</code></li><li><code>link</code></li></ul></td></tr></tbody></table>',
      },
    },
    { type: "browser_compatibility", value: { id: "browser_compatibility", title: "Browser compatibility" } },
  ],
};

test("slugs and baseline labels", () => {
  assert.equal(slugFromUrl("https://developer.mozilla.org/en-US/docs/Web/CSS/:has#syntax"), "Web/CSS/:has");
  assert.equal(baselineLabel({ baseline: "high", baseline_high_date: "2018-01-29" }), "Baseline widely available (since 2018-01)");
  assert.equal(baselineLabel({ baseline: false }), "Limited availability");
});

test("toPage parses sections, strips HTML from titles, skips non-prose", () => {
  const p = toPage(raw);
  assert.equal(p.slug, "Web/HTML/Reference/Elements/x-demo");
  assert.equal(p.baseline, "Baseline newly available (since 2025-09)");
  assert.deepEqual(
    p.sections.map((s) => s.id),
    ["intro", "attributes", "accessibility", "naming", "examples", "technical_summary"],
  );
  assert.equal(section(p, "naming")?.title, "Naming it");
});

test("technical summary rows flatten lists", () => {
  assert.deepEqual(technicalSummary(toPage(raw)), [
    ["Content categories", "Flow content, phrasing content"],
    ["Permitted ARIA roles", "`button`, `link`"],
  ]);
});

test("definitions ignore nested value lists and keep status tags", () => {
  const defs = definitions(section(toPage(raw), "attributes")?.nodes ?? []);
  assert.deepEqual(
    defs.map((d) => [d.name, d.tags, d.brief]),
    [
      ["mode", [], "Sets the mode."],
      ["old", ["deprecated"], "Legacy."],
    ],
  );
});

test("picking an H2 includes its H3 subsections", () => {
  assert.deepEqual(
    pickSections(toPage(raw), ["accessibility"]).map((s) => s.id),
    ["accessibility", "naming"],
  );
});

test("chunks carry heading paths and section URLs", () => {
  const chunks = chunkPage(toPage(raw));
  const naming = chunks.find((c) => c.id.endsWith("#naming"));
  assert.equal(naming?.heading, "Accessibility › Naming it");
  assert.match(naming?.url ?? "", /x-demo#naming$/);
  assert.ok(!chunks.some((c) => c.id.includes("technical_summary") && c.text.length < 120));
});
