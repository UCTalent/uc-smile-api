type EmbedContentResponse = {
  embedding: {
    values: number[];
  };
};

const EMBED_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 200;
const RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedTextWithRetry(text: string, key: string, attempt = 0): Promise<number[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(EMBED_URL(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        // gemini-embedding-001 defaults to 3072 dims; truncate to 768 to match
        // the pgvector column definition and reduce storage/search latency.
        // MRL training means truncated vectors retain quality.
        outputDimensionality: 768,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  // Retry once on rate limit or service unavailable
  if ((response.status === 429 || response.status === 503) && attempt === 0) {
    await sleep(RETRY_DELAY_MS);
    return embedTextWithRetry(text, key, 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini embedding API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as EmbedContentResponse;
  return data.embedding.values;
}

/**
 * Embeds a single text string using Gemini gemini-embedding-001.
 *
 * @param text - The text to embed
 * @returns A 768-dimensional embedding vector
 */
export async function embedText(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return embedTextWithRetry(text, key);
}

/**
 * Embeds multiple texts in batches of 20 with a 200ms delay between batches.
 *
 * @param texts - Array of texts to embed
 * @returns Array of 768-dimensional embedding vectors, in the same order as input
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const embeddings = await Promise.all(
      batch.map((text) => embedTextWithRetry(text, key)),
    );

    results.push(...embeddings);

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < texts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

/**
 * Converts a numeric embedding array to pgvector literal string format.
 *
 * @param embedding - Array of numbers representing a vector
 * @returns String in the format "[n1,n2,...]" suitable for pgvector
 */
export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
