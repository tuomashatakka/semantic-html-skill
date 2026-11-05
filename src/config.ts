/**
 * Single source of truth for paths, URLs and tunables.
 * Everything is env-overridable so the skill folder can live anywhere.
 */
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;

export const SKILL_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const REFERENCES_DIR = join(SKILL_ROOT, "references");

export const CACHE_DIR = resolve(
  env.SEMANTIC_HTML_CACHE ?? join(env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "semantic-html"),
);

export const PATHS = {
  pages: join(CACHE_DIR, "pages"),
  titleIndex: join(CACHE_DIR, "search-index.json"),
  bm25: join(CACHE_DIR, "bm25.json"),
  vectors: join(CACHE_DIR, "vectors.bin"),
  vectorsMeta: join(CACHE_DIR, "vectors.meta.json"),
  status: join(CACHE_DIR, "status.json"),
} as const;

export const MDN = {
  origin: "https://developer.mozilla.org",
  locale: "en-US",
  /** `/en-US/docs/<slug>` → rendered, macro-free JSON at `/index.json`. */
  docUrl: (slug: string) => `${MDN.origin}/${MDN.locale}/docs/${slug}/index.json`,
  pageUrl: (slug: string) => `${MDN.origin}/${MDN.locale}/docs/${slug}`,
  titleIndexUrl: "https://developer.mozilla.org/en-US/search-index.json",
} as const;

/** Slug prefixes indexed for full-text search by default. */
export const DEFAULT_SCOPE: readonly string[] = (
  env.SEMANTIC_HTML_SCOPE?.split(",").map((s) => s.trim()).filter(Boolean) ?? [
    "Web/HTML",
    "Web/Accessibility",
    "Web/CSS",
    "Learn_web_development/Core/Structuring_content",
    "Learn_web_development/Core/Accessibility",
  ]
);

export const FETCH = {
  concurrency: Number(env.SEMANTIC_HTML_CONCURRENCY ?? 8),
  /** Cached pages younger than this are served without revalidation. */
  ttlMs: Number(env.SEMANTIC_HTML_TTL_DAYS ?? 14) * 86_400_000,
  retries: 3,
  timeoutMs: 30_000,
  userAgent: "semantic-html-skill/2 (+mdn lookup)",
} as const;

export const SEARCH = {
  chunkMaxChars: 1500,
  chunkMinChars: 120,
  bm25: { k1: 1.2, b: 0.75, titleBoost: 2.5, headingBoost: 1.5 },
  fetchK: 40,
  rrfK: 60,
} as const;

export const EMBED = {
  enabled: env.SEMANTIC_HTML_EMBED === "1",
  model: env.SEMANTIC_HTML_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2",
  rerankModel: env.SEMANTIC_HTML_RERANK_MODEL ?? "Xenova/ms-marco-MiniLM-L-6-v2",
  dim: 384,
  batch: 32,
} as const;

export const VIEWER = {
  port: Number(env.PORT ?? 7341),
} as const;
