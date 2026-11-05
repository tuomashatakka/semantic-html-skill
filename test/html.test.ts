import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeEntities, parseHtml, textContent } from "../src/html/parse.ts";
import { htmlToMarkdown, statusIcons } from "../src/html/to-markdown.ts";
import { codeTags, mdTable } from "../src/md.ts";

test("decodes named and numeric entities", () => {
  assert.equal(decodeEntities("&lt;a&gt; &amp; &#x3C;b&#62; &nbsp;"), "<a> & <b>  ");
});

test("parser tolerates void elements, raw text and stray closes", () => {
  const nodes = parseHtml('<p>a<br>b<img alt="x"></span></p><script>if (a < b) {}</script>');
  assert.equal(textContent(nodes), "abif (a < b) {}");
});

test("renders MDN prose subset to markdown", () => {
  const md = htmlToMarkdown(
    [
      "<h3>Usage</h3>",
      '<p>Use <code>&lt;dialog&gt;</code> and <a href="/en-US/docs/Web/HTML">HTML</a>.</p>',
      '<div class="notecard note"><p><strong>Note:</strong> careful.</p></div>',
      "<ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>",
      '<pre class="brush: html notranslate"><code>&lt;p&gt;hi&lt;/p&gt;\n</code></pre>',
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>x|y</td></tr></tbody></table>",
    ].join(""),
  );
  assert.match(md, /^### Usage/m);
  assert.match(md, /Use `<dialog>` and \[HTML\]\(https:\/\/developer\.mozilla\.org\/en-US\/docs\/Web\/HTML\)\./);
  assert.match(md, /^> \*\*Note:\*\* careful\./m);
  assert.match(md, /^- two\n {2}- nested/m);
  assert.match(md, /```html\n<p>hi<\/p>\n```/);
  assert.match(md, /\| 1 \| x\\\|y \|/);
});

test("drops live-sample Result headings and keeps links off when asked", () => {
  const md = htmlToMarkdown('<h4>Result</h4><p><a href="/x">text</a></p>', { links: false });
  assert.equal(md, "text");
});

test("reads status icons", () => {
  const nodes = parseHtml('<dt><code>x</code> <span class="icon icon-deprecated"></span><span class="icon icon-experimental"></span></dt>');
  assert.deepEqual(statusIcons(nodes).sort(), ["deprecated", "experimental"]);
});

test("md helpers escape tags and pipes", () => {
  assert.equal(codeTags("use <dialog> not `<div>`"), "use `<dialog>` not `<div>`");
  assert.equal(mdTable(["a"], [["x|y"]]), "| a |\n| --- |\n| x\\|y |");
});
