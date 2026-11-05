#!/usr/bin/env node
/**
 * mdn-search — zero-dependency MCP server over stdio (newline-delimited
 * JSON-RPC 2.0). Dual-era:
 *   - modern (2026-07-28+): stateless, version in `params._meta`,
 *     `server/discover`, results carry `resultType`.
 *   - legacy (≤ 2025-11-25): `initialize` handshake, then plain results.
 *
 * Register (Claude Code):  claude mcp add mdn-search -- node /abs/path/src/mcp/server.ts
 * stdout carries protocol only; logs go to stderr.
 */
import { createInterface } from "node:readline";
import { ensureIndex } from "../lookup.ts";
import { callTool, toolList } from "./tools.ts";

const SERVER_INFO = { name: "mdn-search", title: "MDN search (semantic-html skill)", version: "2.0.0" };
const MODERN = ["2026-07-28"] as const;
const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const INSTRUCTIONS =
  "MDN lookup for writing semantic, accessible HTML and modern CSS. Prefer get_element for a specific element's content model and ARIA role, search_mdn for questions, get_mdn_page to read a page.";

const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, unsupportedVersion: -32022 } as const;

type Id = string | number | null;
interface Request {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown> & { _meta?: Record<string, unknown> };
}

class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

const log = (...a: unknown[]) => console.error("[mdn-search]", ...a);
const send = (msg: unknown) => process.stdout.write(`${JSON.stringify(msg)}\n`);

/** Legacy session state: set once `initialize` succeeds on this process. */
let legacyVersion: string | undefined;

const capabilities = { tools: { listChanged: false } };

/** Resolve the era for a request: modern if `_meta` declares a version, else legacy. */
function eraOf(req: Request): "modern" | "legacy" {
  const v = req.params?._meta?.[META_VERSION];
  if (typeof v === "string") {
    if (!(MODERN as readonly string[]).includes(v)) {
      throw new RpcError(ERR.unsupportedVersion, "Unsupported protocol version", {
        supported: [...MODERN, ...LEGACY],
        requested: v,
      });
    }
    return "modern";
  }
  return "legacy";
}

const complete = <T extends object>(era: "modern" | "legacy", result: T) => (era === "modern" ? { resultType: "complete", ...result } : result);

async function handle(req: Request): Promise<unknown> {
  if (req.method === "initialize") {
    const requested = String(req.params?.protocolVersion ?? "");
    legacyVersion = (LEGACY as readonly string[]).includes(requested) ? requested : LEGACY[0];
    return { protocolVersion: legacyVersion, capabilities, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS };
  }

  const era = eraOf(req);
  switch (req.method) {
    case "server/discover":
      return {
        resultType: "complete",
        supportedVersions: [...MODERN, ...LEGACY],
        capabilities,
        instructions: INSTRUCTIONS,
        _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
        ttlMs: 3_600_000,
        cacheScope: "public",
      };
    case "ping":
      return complete(era, {});
    case "tools/list":
      return complete(era, { tools: toolList(), ...(era === "modern" ? { ttlMs: 3_600_000, cacheScope: "public" } : {}) });
    case "tools/call": {
      const name = req.params?.name;
      if (typeof name !== "string") throw new RpcError(ERR.invalidParams, "tools/call requires `name`");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      return complete(era, await callTool(name, args));
    }
    default:
      throw new RpcError(ERR.methodNotFound, `Method not found: ${req.method}`);
  }
}

async function onLine(line: string): Promise<void> {
  if (!line.trim()) return;
  let req: Request;
  try {
    req = JSON.parse(line) as Request;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: ERR.parse, message: "Parse error" } });
    return;
  }
  const isNotification = req.id === undefined;
  if (typeof req.method !== "string") {
    if (!isNotification) send({ jsonrpc: "2.0", id: req.id, error: { code: ERR.invalidRequest, message: "Invalid request" } });
    return;
  }
  if (isNotification) return; // notifications/initialized, notifications/cancelled, …
  try {
    send({ jsonrpc: "2.0", id: req.id, result: await handle(req) });
  } catch (err) {
    const e = err instanceof RpcError ? err : new RpcError(-32603, (err as Error).message);
    send({ jsonrpc: "2.0", id: req.id, error: { code: e.code, message: e.message, ...(e.data ? { data: e.data } : {}) } });
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Set<Promise<void>>();
rl.on("line", (l) => {
  const p = onLine(l).finally(() => pending.delete(p));
  pending.add(p);
});
// Flush in-flight responses before exiting when the client closes stdin.
rl.on("close", () => void Promise.allSettled(pending).then(() => process.exit(0)));

// Auto-populate: build the index in the background on first run
// (opt out with SEMANTIC_HTML_NO_AUTOINDEX=1, e.g. in tests or offline use).
if (process.env.SEMANTIC_HTML_NO_AUTOINDEX !== "1") {
  ensureIndex({ onProgress: (m) => log(m) })
    .then((s) => log(`index ${s}`))
    .catch((err: Error) => log(`index error: ${err.message}`));
}
