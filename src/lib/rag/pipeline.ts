import type { Message, RagChunkWithScore } from "../db/types";
import type { ResponseLanguage, SubQuestion } from "../intent/types";
import { embedText } from "./ingestion/embedder";
import { generateResponse, generateStreamResponse } from "./llm/gemini";
import { buildChatPrompt, buildGeneralPrompt, buildMixedPrompt } from "./llm/prompt-builder";
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

export async function retrieveChunksForQuery(
  searchQuery: string,
  topK = 10,
): Promise<RagChunkWithScore[]> {
  log(`Retrieve chunks for query: "${searchQuery}"`);

  const queryEmbedding = await embedText(searchQuery);
  const searchResults = await searchSimilarChunks(queryEmbedding, topK);

  log(`Vector search: ${searchResults.length} results (threshold >0.65)`);
  for (const result of searchResults) {
    log(
      `  [${result.similarity.toFixed(4)}] ${result.content.slice(0, 80).replace(/\n/g, " ")}…`,
    );
  }

  if (searchResults.length === 0) {
    return [];
  }

  const topChunks = rerankChunks(searchResults, searchQuery);
  log(`Reranked → top ${topChunks.length} chunks selected:`);
  for (const chunk of topChunks) {
    const score = (chunk as unknown as { final_score?: number }).final_score;
    const scoreStr = score !== undefined ? `score=${score.toFixed(4)} ` : "";
    log(
      `  [${scoreStr}sim=${chunk.similarity.toFixed(4)}] ${chunk.content.slice(0, 100).replace(/\n/g, " ")}…`,
    );
  }

  return topChunks;
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
  responseLanguage: ResponseLanguage = "en",
): AsyncGenerator<string> {
  const isVietnamese = responseLanguage === "vi" || VI_REGEX.test(query);

  log(`Query: "${query}"`);

  const topChunks = await retrieveChunksForQuery(query);

  if (topChunks.length === 0) {
    log("No chunks found — using fallback message");
    yield isVietnamese ? VI_FALLBACK : EN_FALLBACK;
    return;
  }

  // Step 5: Build chat prompt with top 4 chunks
  const messages = buildChatPrompt(query, topChunks, history, responseLanguage);

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

export async function* generalSafeQuery(
  query: string,
  history: Message[],
  responseLanguage: ResponseLanguage = "en",
): AsyncGenerator<string> {
  log(`General-safe query: "${query}"`);
  const messages = buildGeneralPrompt(query, history, responseLanguage);
  const response = await generateResponse(messages);
  yield response;
}

export async function* mixedIntentQuery(
  originalMessage: string,
  history: Message[],
  subQuestions: SubQuestion[],
  faqChunks: RagChunkWithScore[],
  responseLanguage: ResponseLanguage = "en",
): AsyncGenerator<string> {
  log(
    `Mixed-intent query: ${subQuestions.length} parts, ${faqChunks.length} FAQ chunks, language=${responseLanguage}`,
  );
  const messages = buildMixedPrompt(
    originalMessage,
    subQuestions,
    faqChunks,
    history,
    responseLanguage,
  );

  try {
    for await (const token of generateStreamResponse(messages)) {
      yield token;
    }
    log("Mixed-intent LLM stream complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Mixed-intent LLM error: ${msg}`);
    throw err;
  }
}
