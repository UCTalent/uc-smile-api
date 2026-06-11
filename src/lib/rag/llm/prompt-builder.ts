import type { GeminiMessage, Message, RagChunkWithScore } from "../../db/types";

const SYSTEM_INSTRUCTION = `You are a customer support assistant for UC Smile — a dental tourism booking platform that connects patients with verified dental clinics in Vietnam. UC Smile is NOT a clinic itself; it helps customers find suitable dental partners, get transparent pricing, and book appointments.

STRICT RULES:
1. For factual information (prices, services, procedures, clinics, policies): answer ONLY from the FAQ context provided. Never invent or assume details not present in the context.
2. If the FAQ context does not contain the answer to a specific question: say you don't have that information and suggest the customer contact UC Smile support directly.
3. For greetings or general expressions of interest ("I want dental work", "hello"): respond warmly and invite the user to ask a specific question — no factual claims needed.

Be concise, friendly, and natural. Respond in the same language the user used (Vietnamese or English).`;

const MAX_HISTORY_MESSAGES = 6; // Last 3 turns (user + assistant pairs)
const TOKEN_BUDGET = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Builds the Gemini-compatible message array for a RAG chat prompt.
 *
 * Since Gemini has no system role, the system instruction and FAQ context are
 * injected into the first user turn.
 *
 * History is truncated to the last 6 messages (3 turns) and further trimmed
 * if the total estimated token count exceeds 8000.
 *
 * @param query - The current user message
 * @param chunks - Re-ranked FAQ chunks to use as context
 * @param history - Prior conversation messages (user/assistant alternating)
 * @returns Array of Gemini-compatible messages ready for the API call
 */
export function buildChatPrompt(
  query: string,
  chunks: RagChunkWithScore[],
  history: Message[],
): GeminiMessage[] {
  // Build context block from chunks
  const contextLines = chunks.map((chunk, idx) => {
    const category = chunk.metadata?.category ?? "General";
    const question = chunk.metadata?.question ?? "";
    return `[${idx + 1}] Question: ${question}\n    ${chunk.content}\n    Category: ${category}`;
  });

  const contextBlock = `--- FAQ CONTEXT ---\n${contextLines.join("\n")}\n--- END CONTEXT ---`;

  // Combine system instruction + context into the first user message
  const systemAndContext = `${SYSTEM_INSTRUCTION}\n\n${contextBlock}`;

  // Trim history to last MAX_HISTORY_MESSAGES entries
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  // Build Gemini messages array
  const messages: GeminiMessage[] = [];

  // Estimate total tokens and truncate history if needed
  let tokenCount = estimateTokens(systemAndContext) + estimateTokens(query);
  const filteredHistory: Message[] = [];

  // Process history from newest to oldest, include until budget exceeded
  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const msg = recentHistory[i];
    const msgTokens = estimateTokens(msg.content);
    if (tokenCount + msgTokens > TOKEN_BUDGET) {
      break;
    }
    tokenCount += msgTokens;
    filteredHistory.unshift(msg);
  }

  // If history is empty, inject system+context into the sole user turn
  if (filteredHistory.length === 0) {
    messages.push({
      role: "user",
      parts: [{ text: `${systemAndContext}\n\nUser question: ${query}` }],
    });
    return messages;
  }

  // Build messages with history
  // Inject system+context into the first user message in history
  let contextInjected = false;

  for (const msg of filteredHistory) {
    if (msg.role === "user" && !contextInjected) {
      messages.push({
        role: "user",
        parts: [{ text: `${systemAndContext}\n\nUser question: ${msg.content}` }],
      });
      contextInjected = true;
    } else {
      messages.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  // Add current query
  if (contextInjected) {
    messages.push({
      role: "user",
      parts: [{ text: query }],
    });
  } else {
    // Fallback: no history was processed
    messages.push({
      role: "user",
      parts: [{ text: `${systemAndContext}\n\nUser question: ${query}` }],
    });
  }

  return messages;
}
