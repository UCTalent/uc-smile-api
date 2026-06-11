import type { GeminiMessage, Message } from "../db/types";
import { generateResponse } from "../rag/llm/gemini";
import type { ClassifiedIntent, Intent, ResponseLanguage, SubQuestion } from "./types";

const VALID_INTENTS: Intent[] = ["FAQ", "GENERAL_SAFE", "RISKY", "OUT_OF_SCOPE", "GREETING"];
const FALLBACK_RESPONSE_LANGUAGE: ResponseLanguage = "en";

function stripCodeFences(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
}

export function normalizeClassifiedIntent(
  raw: string,
  message: string,
  fallbackLanguage: ResponseLanguage,
): ClassifiedIntent {
  const fallbackQuestion: SubQuestion = {
    text: message,
    intent: "FAQ",
    searchQuery: message,
  };

  const fallback: ClassifiedIntent = {
    subQuestions: [fallbackQuestion],
    responseLanguage: fallbackLanguage,
  };

  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as {
      intent?: unknown;
      responseLanguage?: unknown;
      rewrittenQuery?: unknown;
      searchQuery?: unknown;
      subQuestions?: unknown;
    };

    const normalizedSubQuestions = Array.isArray(parsed.subQuestions)
      ? parsed.subQuestions
          .map((item): SubQuestion | null => {
            if (typeof item !== "object" || item === null) {
              return null;
            }

            const candidate = item as Record<string, unknown>;
            const text =
              typeof candidate.text === "string" && candidate.text.trim() !== ""
                ? candidate.text.trim()
                : fallbackQuestion.text;
            const intent = VALID_INTENTS.includes(candidate.intent as Intent)
              ? (candidate.intent as Intent)
              : fallbackQuestion.intent;
            const searchQuery =
              typeof candidate.searchQuery === "string" && candidate.searchQuery.trim() !== ""
                ? candidate.searchQuery.trim()
                : text;

            return {
              text,
              intent,
              searchQuery,
            };
          })
          .filter((item): item is SubQuestion => item !== null)
      : [];

    if (normalizedSubQuestions.length === 0) {
      const legacyIntent = VALID_INTENTS.includes(parsed.intent as Intent)
        ? (parsed.intent as Intent)
        : fallbackQuestion.intent;
      const legacyText =
        typeof parsed.rewrittenQuery === "string" && parsed.rewrittenQuery.trim() !== ""
          ? parsed.rewrittenQuery.trim()
          : fallbackQuestion.text;
      const legacySearchQuery =
        typeof parsed.searchQuery === "string" && parsed.searchQuery.trim() !== ""
          ? parsed.searchQuery.trim()
          : legacyText;

      normalizedSubQuestions.push({
        text: legacyText,
        intent: legacyIntent,
        searchQuery: legacySearchQuery,
      });
    }

    const responseLanguage =
      parsed.responseLanguage === "vi" || parsed.responseLanguage === "en"
        ? parsed.responseLanguage
        : fallback.responseLanguage;

    return { subQuestions: normalizedSubQuestions, responseLanguage };
  } catch {
    return fallback;
  }
}

function buildClassifierPrompt(
  message: string,
  history: Message[],
): GeminiMessage[] {
  const conversationLines = history.map(
    (item, index) => `${index + 1}. ${item.role.toUpperCase()}: ${item.content}`,
  );
  const conversationBlock =
    conversationLines.length > 0 ? conversationLines.join("\n") : "(empty)";

  const instructions = `You are an intent classifier for UC Smile, a dental tourism booking platform.

Return JSON with this exact shape:
{
  "subQuestions": [
    {
      "text": "<the specific standalone sub-question in the user's language>",
      "intent": "FAQ" | "GENERAL_SAFE" | "RISKY" | "OUT_OF_SCOPE" | "GREETING",
      "searchQuery": "<translated to Vietnamese, standalone, for FAQ search>"
    }
  ],
  "responseLanguage": "vi" | "en"
}

Intent definitions:
- FAQ: Any UC Smile-related question, including services, prices, clinics, booking, policies, finding clinics by location, or follow-up requests about those topics.
- GENERAL_SAFE: General dental education that is safe and not specific medical advice.
- RISKY: Specific medical advice, diagnosis, or treatment recommendation for a person.
- OUT_OF_SCOPE: Unrelated to dental health or UC Smile.
- GREETING: Greeting, thanks, bye, or small talk with no real question.

Rules:
- Decompose the user's message into one or more sub-questions or requests. A single message may contain multiple intents.
- If the message has only one question or request, return exactly one subQuestions item.
- text must be standalone and clear in the user's own language. Resolve follow-up references using conversation history when needed.
- searchQuery must always be Vietnamese and standalone.
- responseLanguage should be determined from the whole conversation, including indirect or natural language requests about which language to use.
- Return ONLY valid JSON. No markdown, no explanation.`;

  return [
    {
      role: "user",
      parts: [
        {
          text: `${instructions}

Conversation history:
${conversationBlock}

Current user message:
${message}`,
        },
      ],
    },
  ];
}

export async function classifyIntent(
  message: string,
  history: Message[],
): Promise<ClassifiedIntent> {
  const prompt = buildClassifierPrompt(message, history);
  const raw = await generateResponse(prompt);
  return normalizeClassifiedIntent(raw, message, FALLBACK_RESPONSE_LANGUAGE);
}
