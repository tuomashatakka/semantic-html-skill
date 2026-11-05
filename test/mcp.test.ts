import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

/** Send JSON-RPC lines to the stdio server and collect responses by id. */
async function rpc(messages: Array<object | string>): Promise<Map<unknown, Record<string, unknown>>> {
  const child = spawn(process.execPath, [join(import.meta.dirname, "../src/mcp/server.ts")], {
    env: { ...process.env, SEMANTIC_HTML_NO_AUTOINDEX: "1", SEMANTIC_HTML_CACHE: mkdtempSync(join(tmpdir(), "shs-")) },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let out = "";
  child.stdout.on("data", (d: Buffer) => (out += d));
  for (const m of messages) child.stdin.write(`${typeof m === "string" ? m : JSON.stringify(m)}\n`);
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  const byId = new Map<unknown, Record<string, unknown>>();
  for (const line of out.trim().split("\n")) {
    const msg = JSON.parse(line) as Record<string, unknown>;
    byId.set(msg.id, msg);
  }
  return byId;
}

const META = { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } };

test("dual-era MCP stdio server", async () => {
  const r = await rpc([
    { jsonrpc: "2.0", id: 1, method: "server/discover", params: META },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: META },
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1900-01-01" } } },
    { jsonrpc: "2.0", id: 4, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 5, method: "tools/list" },
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } },
    { jsonrpc: "2.0", id: 7, method: "nope/nope", params: META },
    "not json",
  ]);

  const discover = r.get(1)?.result as Record<string, unknown>;
  assert.equal(discover.resultType, "complete");
  assert.ok((discover.supportedVersions as string[]).includes("2026-07-28"));

  const modernTools = r.get(2)?.result as { resultType: string; tools: Array<{ name: string; inputSchema: object }> };
  assert.equal(modernTools.resultType, "complete");
  assert.deepEqual(
    modernTools.tools.map((t) => t.name),
    ["search_mdn", "get_element", "get_mdn_page", "lookup_mdn_title", "index_status", "reindex_mdn"],
  );
  assert.ok(modernTools.tools.every((t) => t.inputSchema && !("run" in t)));

  assert.equal((r.get(3)?.error as { code: number }).code, -32022);
  assert.equal((r.get(4)?.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
  assert.equal((r.get(5)?.result as { resultType?: string }).resultType, undefined, "legacy results carry no resultType");
  assert.equal((r.get(6)?.result as { isError: boolean }).isError, true);
  assert.equal((r.get(7)?.error as { code: number }).code, -32601);
  assert.equal((r.get(null)?.error as { code: number }).code, -32700);
});
