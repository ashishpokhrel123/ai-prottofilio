/* eslint-disable no-console -- a CLI probe whose entire output is its report;
   the pino logger is a request-scoped API concern and has no place here. */

/**
 * Probes the three NVIDIA NIM endpoints the RAG stack depends on.
 *
 *   pnpm --filter @ai-portfolio/api nvidia:smoke
 *
 * Run this before switching `LLM_PROVIDER`, and again after any model-id
 * change. It exists because the three failures that matter here are all silent
 * from inside the app: a model id that no longer resolves, an embedding width
 * that no longer matches the column, and a ranking endpoint that returns 200
 * with a shape nobody parses. Each would otherwise surface as "the assistant
 * got worse" rather than as an error.
 *
 * Goes through the API's own config pipeline rather than reading `process.env`
 * directly. Re-deriving the defaults here would mean the script could pass
 * against model ids the API never uses — the one thing a smoke test must not
 * do. It also means a green run has already validated the environment.
 */

import {
  buildConfig,
  nvidiaRerankPath,
} from "../src/common/config/configuration";
import { envSchema } from "../src/common/config/env.schema";
import { loadEnvFiles } from "../src/common/config/load-env";

loadEnvFiles();

/**
 * Parsed with the schema but *not* through `parseEnv`, which throws the
 * aggregate error. A missing DATABASE_URL is irrelevant to whether NVIDIA
 * answers, and failing on it would make the probe unusable in exactly the
 * situation it is for: a half-configured environment being brought up.
 */
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Environment failed validation, so the NVIDIA settings below may not be " +
      "the ones the API would boot with:\n" +
      parsed.error.issues
        .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n") +
      "\n",
  );
  process.exit(1);
}

const config = buildConfig(parsed.data);
const nvidia = config.nvidia;

const BASE_URL = nvidia.baseUrl.replace(/\/+$/, "");
const RERANK_BASE_URL = nvidia.rerankBaseUrl.replace(/\/+$/, "");
const LLM_MODEL = nvidia.llmModel;
const EMBED_MODEL = nvidia.embeddingModel;
const RERANK_MODEL = nvidia.rerankModel;
const RERANK_PATH = nvidia.rerankPath;
const EXPECTED_DIMENSIONS = nvidia.dimensions;

const headers = {
  Authorization: `Bearer ${nvidia.apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

/** Two passages where the right answer needs meaning, not shared keywords. */
const QUERY = "What database does the portfolio use for semantic search?";
const PASSAGES = [
  "Deployment runs behind Caddy, which provisions TLS certificates on first boot.",
  "Chunks are stored in Postgres with the pgvector extension and searched by cosine distance.",
];

const failures: string[] = [];

function report(name: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name.padEnd(12)} ${detail}`);
  if (!ok) failures.push(name);
}

async function post(url: string, body: unknown): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res;
}

/** Confirms the key is accepted and both configured ids actually exist. */
async function checkCatalogue(): Promise<void> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    report("catalogue", false, `HTTP ${res.status} — is the key valid?`);
    return;
  }

  const body = (await res.json()) as { data?: { id?: string }[] };
  const ids = new Set((body.data ?? []).map((m) => m.id));

  if (ids.size === 0) {
    report("catalogue", true, "endpoint listed no models (self-hosted?)");
    return;
  }

  // Only the models this host actually serves.
  //
  // The reranking model was checked here too, and failed every run: ranking
  // lives on a different host and never appears in the integrate catalogue.
  // A check that always fails trains you to ignore the output, which is worse
  // than not having it. Reranking is verified functionally instead, below.
  for (const [label, id] of [
    ["llm", LLM_MODEL],
    ["embed", EMBED_MODEL],
  ] as const) {
    report(
      `catalogue:${label}`,
      ids.has(id),
      ids.has(id) ? id : `${id} is not on this endpoint`,
    );
  }
}

/**
 * The check that pays for this script: the returned width versus the width the
 * vector column was created with. A mismatch is invisible until the first
 * insert of a re-index, by which point the failure is buried in worker logs.
 */
async function checkEmbeddings(): Promise<void> {
  const res = await post(`${BASE_URL}/embeddings`, {
    model: EMBED_MODEL,
    input: [QUERY],
    input_type: "query",
    encoding_format: "float",
    truncate: "END",
  });

  const body = (await res.json()) as {
    data?: { index: number; embedding: number[] }[];
  };
  const vector = body.data?.[0]?.embedding;

  if (!Array.isArray(vector)) {
    report("embeddings", false, "response carried no embedding array");
    return;
  }

  const matches = vector.length === EXPECTED_DIMENSIONS;
  report(
    "embeddings",
    matches,
    matches
      ? `${vector.length} dimensions, matches EMBEDDING_DIMENSIONS`
      : `returned ${vector.length} dimensions but EMBEDDING_DIMENSIONS=${EXPECTED_DIMENSIONS} — ` +
          "inserts will fail on re-index",
  );
}

/**
 * Asserts ordering, not just a 200.
 *
 * The keyword-free passage is the correct answer, so a reranker that is wired
 * up but ranking on nothing — a plausible outcome of a field-name change —
 * fails here rather than quietly degrading retrieval in production.
 */
async function checkReranking(): Promise<void> {
  const body = {
    model: RERANK_MODEL,
    query: { text: QUERY },
    passages: PASSAGES.map((text) => ({ text })),
    truncate: "END",
  };

  /**
   * Probed rather than assumed.
   *
   * NVIDIA serves ranking under two different shapes depending on the model
   * and the deployment — a per-model `/retrieval/{org}/{model}/reranking` on
   * the hosted API, and a flat `/ranking` on self-hosted containers. The API
   * reference that would settle it is client-rendered, and a wrong guess
   * returns a bare "404 page not found" with no hint which half is wrong.
   *
   * Trying the configured path first means a working setup costs one request;
   * only a failure pays for the alternatives.
   */
  const candidates = [
    RERANK_PATH,
    nvidiaRerankPath(RERANK_MODEL),
    "/ranking",
  ].filter((path, i, all) => all.indexOf(path) === i);

  let res: Response | undefined;
  let used = "";
  const tried: string[] = [];

  for (const path of candidates) {
    try {
      res = await post(`${RERANK_BASE_URL}${path}`, body);
      used = path;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      tried.push(path);
      // Only a 404 means "wrong path". A 401 or 429 is a different problem
      // and trying more paths would just burn rate limit to rediscover it.
      if (!message.includes("404")) throw err;
    }
  }

  if (!res) {
    report(
      "reranking",
      false,
      `no ranking endpoint answered on ${RERANK_BASE_URL}. Tried: ` +
        `${tried.join(", ")}. Set NVIDIA_RERANK_PATH, or check the model is ` +
        "available to your key at build.nvidia.com.",
    );
    return;
  }

  if (used !== RERANK_PATH) {
    report(
      "reranking:path",
      true,
      `answered on ${used} — set NVIDIA_RERANK_PATH=${used} to skip the probe`,
    );
  }

  const parsed = (await res.json()) as {
    rankings?: { index: number; logit: number }[];
  };
  const rankings = parsed.rankings ?? [];

  if (rankings.length !== PASSAGES.length) {
    report(
      "reranking",
      false,
      `expected ${PASSAGES.length} rankings, got ${rankings.length} — ` +
        "check the response shape in nvidia.reranker.ts",
    );
    return;
  }

  const top = rankings.reduce((a, b) => (b.logit > a.logit ? b : a));
  report(
    "reranking",
    top.index === 1,
    top.index === 1
      ? `ranked the pgvector passage first (logit ${top.logit.toFixed(3)})`
      : `ranked passage ${top.index} first — expected the pgvector one`,
  );
}

/** Streaming, because that is the path chat actually takes. */
async function checkGeneration(): Promise<void> {
  const res = await post(`${BASE_URL}/chat/completions`, {
    model: LLM_MODEL,
    messages: [
      { role: "system", content: "Answer in exactly one short sentence." },
      { role: "user", content: "What is retrieval-augmented generation?" },
    ],
    max_tokens: 128,
    stream: true,
  });

  const reader = res.body?.getReader();
  if (!reader) {
    report("generation", false, "response carried no body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break;

      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string | null } }[];
        };
        text += chunk.choices?.[0]?.delta?.content ?? "";
      } catch {
        // Partial frame; the buffer loop will complete it.
      }
    }
  }

  report(
    "generation",
    text.trim().length > 0,
    text.trim().length > 0
      ? `streamed ${text.length} chars: "${text.trim().slice(0, 60)}…"`
      : "stream produced no content deltas",
  );
}

async function main(): Promise<void> {
  if (!nvidia.isConfigured) {
    console.error(
      "NVIDIA_API_KEY is unset or still a placeholder. Get a free key at " +
        "https://build.nvidia.com and add it to .env.",
    );
    process.exit(1);
  }

  console.log(`\nNVIDIA NIM smoke test → ${BASE_URL}\n`);

  const checks: [string, () => Promise<void>][] = [
    ["catalogue", checkCatalogue],
    ["embeddings", checkEmbeddings],
    ["reranking", checkReranking],
    ["generation", checkGeneration],
  ];

  // Sequential, not Promise.all. The free tier is ~40 requests per minute and
  // rate-limits on burst, so a parallel run can report a 429 as a broken model.
  for (const [name, check] of checks) {
    try {
      await check();
    } catch (err) {
      report(name, false, err instanceof Error ? err.message : String(err));
    }
  }

  console.log(
    failures.length === 0
      ? "\nAll checks passed.\n"
      : `\n${failures.length} check(s) failed: ${failures.join(", ")}\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

void main();
