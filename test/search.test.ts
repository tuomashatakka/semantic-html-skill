import assert from "node:assert/strict";
import { test } from "node:test";
import { lookupTitle } from "../src/mdn/title-index.ts";
import { buildBm25, searchBm25, tokenize } from "../src/search/bm25.ts";
import type { Chunk } from "../src/search/chunk.ts";
import { fitPca, project, quantize, topK } from "../src/search/vectors.ts";

const chunk = (id: string, title: string, text: string, heading = ""): Chunk => ({ id, slug: id, url: id, title, heading, text });

test("tokenizer keeps platform tokens and folds plurals", () => {
  const t = tokenize("Use <dialog> with aria-label, @layer and :has() selectors");
  for (const tok of ["<dialog>", "aria-label", "@layer", ":has", "dialog", "selector"]) assert.ok(t.includes(tok), tok);
  assert.ok(!t.includes("with"));
});

test("bm25 ranks title matches and survives prototype-ish tokens", () => {
  const idx = buildBm25([
    chunk("a", "<dialog> element", "Modal dialog windows with showModal."),
    chunk("b", "<div> element", "A generic container. The constructor property."),
    chunk("c", "Popover API", "Light dismiss popovers, not a dialog."),
  ]);
  const hits = searchBm25(idx, "modal dialog", 3);
  assert.equal(hits[0]?.doc, 0);
  assert.equal(searchBm25(idx, "constructor", 3)[0]?.doc, 1);
  assert.deepEqual(searchBm25(idx, "toString valueOf", 3), []);
});

test("title lookup: exact and code-ish queries win", () => {
  const entries = [
    { title: ":has-slotted CSS pseudo-class", slug: "Web/CSS/Reference/Selectors/:has-slotted", url: "" },
    { title: "Headers: has() method", slug: "Web/API/Headers/has", url: "" },
    { title: ":has() CSS pseudo-class", slug: "Web/CSS/Reference/Selectors/:has", url: "" },
    { title: "<search> HTML generic search element", slug: "Web/HTML/Reference/Elements/search", url: "" },
    { title: "URL: search property", slug: "Web/API/URL/search", url: "" },
  ];
  assert.equal(lookupTitle(entries, ":has()", 1)[0]?.slug, "Web/CSS/Reference/Selectors/:has");
  assert.equal(lookupTitle(entries, "<search>", 1)[0]?.slug, "Web/HTML/Reference/Elements/search");
  assert.deepEqual(lookupTitle(entries, "nonexistent thing"), []);
});

test("int8 vectors: cosine top-k and PCA projection", () => {
  const unit = (...xs: number[]) => {
    const n = Math.hypot(...xs);
    return Float32Array.from(xs, (x) => x / n);
  };
  const rows = [unit(1, 0, 0), unit(0.9, 0.1, 0), unit(0, 1, 0), unit(0, 0, 1)];
  const store = quantize(rows, ["a", "b", "c", "d"]);
  assert.deepEqual(
    topK(store, unit(1, 0.05, 0), 2).map((h) => h.doc),
    [0, 1],
  );
  const pca = fitPca(rows, 2);
  const p = project(pca, rows[0] as Float32Array);
  assert.equal(p.length, 2);
  assert.ok(p.every((x) => Math.abs(x) <= 1.0001));
});
