import type { Message } from "../db/types";
import { embedText } from "./ingestion/embedder";
import { buildChatPrompt } from "./llm/prompt-builder";
import { generateStreamResponse } from "./llm/gemini";
import { rerankChunks } from "./retrieval/reranker";
import { searchSimilarChunks } from "./retrieval/vector-search";

// Regex to detect Vietnamese characters
const VI_REGEX =
  /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;

const VI_FALLBACK =
  "Xin lỗi, tôi không tìm thấy thông tin liên quan đến câu hỏi của bạn. Vui lòng liên hệ bộ phận hỗ trợ để được giúp đỡ.";

const EN_FALLBACK =
  "I'm sorry, I couldn't find relevant information for your question. Please contact our support team for assistance.";

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] [RAG] ${msg}`);
}

/**
 * Runs a full RAG query pipeline: embed → search → rerank → stream LLM response.
 *
 * Falls back to a static message (in the appropriate language) if no similar
 * chunks are found in the vector store.
 *
 * @param query - The user's question
 * @param history - Prior conversation messages for multi-turn context
 * @yields Streamed text tokens from the Gemini LLM
 */
export async function* ragQuery(
  query: string,
  history: Message[],
): AsyncGenerator<string> {
  const isVietnamese = VI_REGEX.test(query);

  log(`Query: "${query}"`);

  // Step 1: Embed the query
  const queryEmbedding = await embedText(query);

  // Step 2: Vector search for similar chunks
  const searchResults = await searchSimilarChunks(queryEmbedding, 10);
  log(`Vector search: ${searchResults.length} results (threshold >0.65)`);
  for (const r of searchResults) {
    log(`  [${r.similarity.toFixed(4)}] ${r.content.slice(0, 80).replace(/\n/g, " ")}…`);
  }

  // Step 3: Fallback if no results found
  if (searchResults.length === 0) {
    log("No chunks found — using fallback message");
    yield isVietnamese ? VI_FALLBACK : EN_FALLBACK;
    return;
  }

  // Step 4: Re-rank chunks
  const topChunks = rerankChunks(searchResults, query);
  log(`Reranked → top ${topChunks.length} chunks sent to LLM:`);
  for (const c of topChunks) {
    const score = (c as unknown as { final_score?: number }).final_score;
    const scoreStr = score !== undefined ? `score=${score.toFixed(4)} ` : "";
    log(`  [${scoreStr}sim=${c.similarity.toFixed(4)}] ${c.content.slice(0, 100).replace(/\n/g, " ")}…`);
  }

  // Step 5: Build chat prompt with top 4 chunks
  const messages = buildChatPrompt(query, topChunks, history);

  // Step 6: Stream LLM response
  log("Streaming LLM response…");
  try {
    for await (const token of generateStreamResponse(messages)) {
      yield token;
    }
    log("LLM stream complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`LLM error: ${msg}`);
    throw err;
  }
}
