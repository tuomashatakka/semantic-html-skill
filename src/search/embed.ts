/**
 * Optional semantic layer: sentence embeddings + cross-encoder rerank via
 * `@huggingface/transformers` (ONNX, runs locally). The package is an
 * optionalDependency and is imported lazily; everything else works without it.
 */
import { join } from "node:path";
import { CACHE_DIR, EMBED } from "../config.ts";

export class EmbeddingsUnavailable extends Error {
  constructor(cause?: unknown) {
    super(
      "Embeddings unavailable: install the optional dependency `@huggingface/transformers` (npm install) to enable semantic search.",
      { cause },
    );
  }
}

// Structural types for the bits of transformers.js we use (keeps typecheck
// independent of whether the optional package is installed).
interface Tensor {
  data: Float32Array;
  dims: number[];
}
type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<Tensor>;
type Tokenizer = (
  text: string[],
  opts: { text_pair: string[]; padding: boolean; truncation: boolean },
) => Record<string, unknown>;
type SeqModel = (inputs: Record<string, unknown>) => Promise<{ logits: Tensor }>;
interface TransformersModule {
  env: { cacheDir: string | null };
  pipeline: (task: "feature-extraction", model: string, opts: { dtype: string }) => Promise<Extractor>;
  AutoTokenizer: { from_pretrained: (m: string) => Promise<Tokenizer> };
  AutoModelForSequenceClassification: { from_pretrained: (m: string, o: { dtype: string }) => Promise<SeqModel> };
}

let mod: Promise<TransformersModule> | undefined;
let extractor: Promise<Extractor> | undefined;
let reranker: Promise<{ tok: Tokenizer; model: SeqModel }> | undefined;

async function load(): Promise<TransformersModule> {
  mod ??= (async () => {
    const spec = "@huggingface/transformers";
    try {
      const m = (await import(spec)) as TransformersModule;
      m.env.cacheDir = join(CACHE_DIR, "models");
      return m;
    } catch (err) {
      mod = undefined;
      throw new EmbeddingsUnavailable(err);
    }
  })();
  return mod;
}

export async function embeddingsAvailable(): Promise<boolean> {
  try {
    await load();
    return true;
  } catch {
    return false;
  }
}

/** Embed texts → L2-normalised Float32 rows of length EMBED.dim. */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  const m = await load();
  extractor ??= m.pipeline("feature-extraction", EMBED.model, { dtype: "q8" });
  const ex = await extractor;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += EMBED.batch) {
    const t = await ex(texts.slice(i, i + EMBED.batch), { pooling: "mean", normalize: true });
    const dim = t.dims[1] ?? EMBED.dim;
    for (let r = 0; r < (t.dims[0] ?? 0); r++) out.push(t.data.slice(r * dim, (r + 1) * dim));
  }
  return out;
}

/** Cross-encoder relevance scores for (query, doc) pairs. */
export async function rerankScores(query: string, docs: string[]): Promise<number[]> {
  if (!docs.length) return [];
  const m = await load();
  reranker ??= (async () => ({
    tok: await m.AutoTokenizer.from_pretrained(EMBED.rerankModel),
    model: await m.AutoModelForSequenceClassification.from_pretrained(EMBED.rerankModel, { dtype: "q8" }),
  }))();
  const { tok, model } = await reranker;
  const inputs = tok(
    docs.map(() => query),
    { text_pair: docs.map((d) => d.slice(0, 2000)), padding: true, truncation: true },
  );
  const { logits } = await model(inputs);
  return Array.from(logits.data);
}
