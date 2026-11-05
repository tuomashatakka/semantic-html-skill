/** Table helpers shared by page parsing and reference generation. */
import { type ElementNode, type HtmlNode, children, findAll } from "./parse.ts";

/** All `<tr>` rows (thead/tbody/tfoot flattened) as arrays of cell elements. */
export function tableRows(table: ElementNode): ElementNode[][] {
  const rows: ElementNode[][] = [];
  const walk = (n: ElementNode) => {
    for (const c of children(n)) {
      if (c.tag === "tr") rows.push(children(c).filter((x) => x.tag === "td" || x.tag === "th"));
      else if (/^(thead|tbody|tfoot)$/.test(c.tag)) walk(c);
    }
  };
  walk(table);
  return rows;
}

export const tables = (nodes: readonly HtmlNode[]) => findAll(nodes, (n) => n.tag === "table");

/**
 * A two-column "properties" table (`<th scope=row>key</th><td>value</td>`)
 * as ordered [key, valueCell] pairs. `render` turns the key cell into text.
 */
export function propertyRows(table: ElementNode, render: (cell: ElementNode) => string): Array<[string, ElementNode]> {
  const out: Array<[string, ElementNode]> = [];
  for (const row of tableRows(table)) {
    const [k, v] = row;
    if (k && v) out.push([render(k), v]);
  }
  return out;
}
