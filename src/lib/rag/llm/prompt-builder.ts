import type { GeminiMessage, Message, RagChunkWithScore } from "../../db/types";
import type { ResponseLanguage, SubQuestion } from "../../intent/types";

const SHARED_GUARDRAILS = `NEVER mention "FAQ", "context", "knowledge base", "database", "the information I was provided", or any internal implementation detail.
If you do not have the needed information, say that you do not currently have that information and suggest contacting UC Smile support.`;

const RAG_SYSTEM_INSTRUCTION = `You are a customer support assistant for UC Smile, a dental tourism booking platform that connects patients with verified dental clinics in Vietnam. UC Smile is NOT a clinic itself; it helps customers find suitable dental partners, get transparent pricing, and book appointments.

STRICT RULES:
1. For factual information about UC Smile (prices, services, procedures, clinics, policies, booking): answer ONLY from the provided source material. Never invent or assume details that are not supported.
2. If the source material does not contain the answer to a specific question: say you do not currently have that information and suggest the customer contact UC Smile support directly.
3. For greetings or general expressions of interest: respond warmly and invite the user to ask a specific question.
4. ${SHARED_GUARDRAILS}

Be concise, friendly, and natural.`;

const GENERAL_SYSTEM_INSTRUCTION = `You are a helpful dental health information assistant for UC Smile.

STRICT RULES:
1. Answer general dental health questions concisely, clearly, and factually.
2. Never give specific medical advice, diagnosis, or treatment recommendations for an individual person.
3. If the request becomes personalized or clinically risky, state that you cannot help with that and recommend contacting a qualified dentist or UC Smile support.
4. Always end by recommending the user contact UC Smile support for personalized guidance.
5. ${SHARED_GUARDRAILS}

Be concise, calm, and supportive.`;

const MAX_HISTORY_MESSAGES = 6; // Last 3 turns (user + assistant pairs)
const TOKEN_BUDGET = 8000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildLanguageInstruction(responseLanguage: ResponseLanguage): string {
  return `Respond in ${responseLanguage === "vi" ? "Vietnamese" : "English"}.`;
}

function buildContextBlock(chunks: RagChunkWithScore[]): string {
  if (chunks.length === 0) {
    return "--- SOURCE MATERIAL ---\n(No source material found.)\n--- END SOURCE MATERIAL ---";
  }

  const contextLines = chunks.map((chunk, idx) => {
    const category = chunk.metadata?.category ?? "General";
    const question = chunk.metadata?.question ?? "";
    return `[${idx + 1}] Question: ${question}\n    ${chunk.content}\n    Category: ${category}`;
  });

  return `--- SOURCE MATERIAL ---\n${contextLines.join("\n")}\n--- END SOURCE MATERIAL ---`;
}

function buildMessagesWithHistory(
  instructionBlock: string,
  currentPrompt: string,
  history: Message[],
): GeminiMessage[] {
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
  const messages: GeminiMessage[] = [];

  let tokenCount = estimateTokens(instructionBlock) + estimateTokens(currentPrompt);
  const filteredHistory: Message[] = [];

  for (let i = recentHistory.length - 1; i >= 0; i--) {
    const msg = recentHistory[i];
    const msgTokens = estimateTokens(msg.content);
    if (tokenCount + msgTokens > TOKEN_BUDGET) {
      break;
    }
    tokenCount += msgTokens;
    filteredHistory.unshift(msg);
  }

  if (filteredHistory.length === 0) {
    messages.push({
      role: "user",
      parts: [{ text: `${instructionBlock}\n\nUser question: ${currentPrompt}` }],
    });
    return messages;
  }

  let instructionInjected = false;

  for (const msg of filteredHistory) {
    if (msg.role === "user" && !instructionInjected) {
      messages.push({
        role: "user",
        parts: [{ text: `${instructionBlock}\n\nUser question: ${msg.content}` }],
      });
      instructionInjected = true;
    } else {
      messages.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      });
    }
  }

  if (instructionInjected) {
    messages.push({
      role: "user",
      parts: [{ text: currentPrompt }],
    });
  } else {
    messages.push({
      role: "user",
      parts: [{ text: `${instructionBlock}\n\nUser question: ${currentPrompt}` }],
    });
  }

  return messages;
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
  responseLanguage: ResponseLanguage = "en",
): GeminiMessage[] {
  const instructionBlock = `${RAG_SYSTEM_INSTRUCTION}\n${buildLanguageInstruction(responseLanguage)}\n\n${buildContextBlock(chunks)}`;
  return buildMessagesWithHistory(instructionBlock, query, history);
}

export function buildGeneralPrompt(
  query: string,
  history: Message[],
  responseLanguage: ResponseLanguage = "en",
): GeminiMessage[] {
  const instructionBlock = `${GENERAL_SYSTEM_INSTRUCTION}\n${buildLanguageInstruction(responseLanguage)}`;
  return buildMessagesWithHistory(instructionBlock, query, history);
}

export function buildMixedPrompt(
  originalMessage: string,
  subQuestions: SubQuestion[],
  faqChunks: RagChunkWithScore[],
  history: Message[],
  responseLanguage: ResponseLanguage = "en",
): GeminiMessage[] {
  const subQuestionLines = subQuestions.map(
    (item, index) => `[${index + 1}] intent=${item.intent}\ntext=${item.text}`,
  );

  const mixedInstruction = `You are a customer support assistant for UC Smile and a careful dental information assistant.

User asked multiple questions. Handle the whole reply naturally as one coherent response.

STRICT RULES:
1. For FAQ questions: answer ONLY from the provided source material. If the answer is not in the source material, say you do not currently have that information and suggest contacting UC Smile support.
2. For GENERAL_SAFE questions: answer briefly, factually, and safely. Do not make UC Smile-specific claims unless supported by the source material.
3. For RISKY questions: politely decline to provide diagnosis, treatment planning, or personalized medical advice. Recommend consulting a dental professional or UC Smile support.
4. For OUT_OF_SCOPE questions: politely note that you only cover dental and UC Smile topics.
5. For GREETING questions: respond warmly and naturally.
6. Do not answer as a mechanical checklist unless the user explicitly asked for a list. A short structured reply is okay if it improves clarity.
7. ${SHARED_GUARDRAILS}

${buildLanguageInstruction(responseLanguage)}`;

  const currentPrompt = `Original user message:
${originalMessage}

Decomposed sub-questions:
${subQuestionLines.join("\n\n")}`;

  const instructionBlock = `${mixedInstruction}\n\n${buildContextBlock(faqChunks)}`;
  return buildMessagesWithHistory(instructionBlock, currentPrompt, history);
}
