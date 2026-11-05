/** Index build status, shared via a JSON file so CLI / MCP / viewer agree. */
import { readFile } from "node:fs/promises";
import { PATHS } from "./config.ts";
import { writeJsonFile } from "./mdn/fetch.ts";

export type IndexState = "missing" | "fetching" | "indexing" | "embedding" | "ready" | "error" | "interrupted";

const BUILDING: ReadonlySet<IndexState> = new Set(["fetching", "indexing", "embedding"]);

export interface Status {
  state: IndexState;
  done?: number;
  total?: number;
  detail?: string;
  chunks?: number;
  pages?: number;
  embeddings?: boolean;
  scope?: string[];
  builtAt?: string;
  /** Process that is building; used to detect builds that died mid-way. */
  pid?: number;
  updatedAt: string;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** True while another live process is building the index. */
export const buildRunning = (s: Status) => BUILDING.has(s.state) && s.pid !== undefined && s.pid !== process.pid && alive(s.pid);

export async function readStatus(): Promise<Status> {
  try {
    const s = JSON.parse(await readFile(PATHS.status, "utf8")) as Status;
    // A build that was killed leaves a "building" state behind: surface it honestly.
    if (BUILDING.has(s.state) && (s.pid === undefined || !alive(s.pid))) return { ...s, state: "interrupted" };
    return s;
  } catch {
    return { state: "missing", updatedAt: new Date(0).toISOString() };
  }
}

export async function writeStatus(s: Omit<Status, "updatedAt" | "pid">): Promise<void> {
  const pid = BUILDING.has(s.state) ? process.pid : undefined;
  await writeJsonFile(PATHS.status, { ...s, pid, updatedAt: new Date().toISOString() });
}
