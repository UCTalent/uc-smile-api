import { Router } from "express";
import type { Request, Response } from "express";
import type { Message, RagChunkWithScore } from "../lib/db/types";
import { classifyIntent } from "../lib/intent/classifier";
import type { Intent, ResponseLanguage } from "../lib/intent/types";
import { generalSafeQuery, mixedIntentQuery, ragQuery, retrieveChunksForQuery } from "../lib/rag/index";
import { rateLimiterMiddleware } from "../middleware/rate-limiter";

export const chatRouter = Router();

const GREETING_MESSAGES: Record<ResponseLanguage, string> = {
  en: "Hello! I'm here to help with UC Smile questions and general dental information. What would you like to know?",
  vi: "Xin chào! Tôi có thể hỗ trợ về thông tin UC Smile và các câu hỏi nha khoa tổng quát. Bạn muốn tìm hiểu gì?",
};

const REFUSAL_MESSAGES: Record<Exclude<Intent, "FAQ" | "GENERAL_SAFE" | "GREETING">, Record<ResponseLanguage, string>> =
  {
    OUT_OF_SCOPE: {
      en: "I can only help with UC Smile and dental-related questions. If you need support about UC Smile, please contact the team directly.",
      vi: "Tôi chỉ có thể hỗ trợ các câu hỏi liên quan đến UC Smile và nha khoa. Nếu bạn cần hỗ trợ về UC Smile, vui lòng liên hệ đội ngũ hỗ trợ.",
    },
    RISKY: {
      en: "I can't provide specific medical advice or treatment recommendations. Please contact a qualified dentist or UC Smile support for personalized guidance.",
      vi: "Tôi không thể đưa ra lời khuyên y khoa cụ thể hoặc khuyến nghị điều trị cá nhân. Vui lòng liên hệ nha sĩ chuyên môn hoặc bộ phận hỗ trợ UC Smile để được tư vấn phù hợp.",
    },
  };

function greetingMessage(language: ResponseLanguage): string {
  return GREETING_MESSAGES[language];
}

function refusalMessage(
  intent: Exclude<Intent, "FAQ" | "GENERAL_SAFE" | "GREETING">,
  language: ResponseLanguage,
): string {
  return REFUSAL_MESSAGES[intent][language];
}

function dedupeChunks(chunkLists: RagChunkWithScore[][]): RagChunkWithScore[] {
  const seen = new Map<string, RagChunkWithScore>();

  for (const chunks of chunkLists) {
    for (const chunk of chunks) {
      const existing = seen.get(chunk.id);
      const currentScore = chunk.final_score ?? chunk.similarity;
      const existingScore = existing?.final_score ?? existing?.similarity ?? Number.NEGATIVE_INFINITY;

      if (!existing || currentScore > existingScore) {
        seen.set(chunk.id, chunk);
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    const scoreA = a.final_score ?? a.similarity;
    const scoreB = b.final_score ?? b.similarity;
    return scoreB - scoreA;
  });
}

type ChatRequestBody = {
  message?: unknown;
  history?: unknown;
};

chatRouter.post("/", rateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as ChatRequestBody;

  // Validate message
  if (typeof body.message !== "string" || body.message.trim() === "") {
    res.status(400).json({ error: "message must be a non-empty string" });
    return;
  }

  if (body.message.length > 500) {
    res.status(400).json({ error: "message must be 500 characters or fewer" });
    return;
  }

  // Validate history
  if (body.history !== undefined && !Array.isArray(body.history)) {
    res.status(400).json({ error: "history must be an array" });
    return;
  }

  const rawHistory = (body.history ?? []) as unknown[];
  if (rawHistory.length > 20) {
    res.status(400).json({ error: "history must contain 20 items or fewer" });
    return;
  }

  // Type-check history items
  const history: Message[] = rawHistory.map((item, idx) => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("role" in item) ||
      !("content" in item)
    ) {
      throw new Error(`history[${idx}] must have role and content fields`);
    }
    const msg = item as Record<string, unknown>;
    if (msg.role !== "user" && msg.role !== "assistant") {
      throw new Error(`history[${idx}].role must be "user" or "assistant"`);
    }
    if (typeof msg.content !== "string") {
      throw new Error(`history[${idx}].content must be a string`);
    }
    return { role: msg.role, content: msg.content };
  });

  const message = body.message.trim();

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const classified = await classifyIntent(message, history);
    const { responseLanguage, subQuestions } = classified;

    let generator: AsyncGenerator<string>;

    const allGreeting = subQuestions.every((question) => question.intent === "GREETING");
    if (allGreeting) {
      generator = (async function* () {
        yield greetingMessage(responseLanguage);
      })();
    } else if (subQuestions.length === 1) {
      const [question] = subQuestions;

      switch (question.intent) {
        case "FAQ":
          generator = ragQuery(question.searchQuery, history, responseLanguage);
          break;
        case "GENERAL_SAFE":
          generator = generalSafeQuery(question.text, history, responseLanguage);
          break;
        case "GREETING":
          generator = (async function* () {
            yield greetingMessage(responseLanguage);
          })();
          break;
        case "RISKY":
        case "OUT_OF_SCOPE":
          const refusalIntent: "RISKY" | "OUT_OF_SCOPE" = question.intent;
          generator = (async function* () {
            yield refusalMessage(refusalIntent, responseLanguage);
          })();
          break;
        default:
          generator = ragQuery(message, history, "en");
          break;
      }
    } else {
      const faqQuestions = subQuestions.filter((question) => question.intent === "FAQ");
      const faqChunkLists = await Promise.all(
        faqQuestions.map((question) => retrieveChunksForQuery(question.searchQuery)),
      );
      const faqChunks = dedupeChunks(faqChunkLists);

      generator = mixedIntentQuery(
        message,
        history,
        subQuestions,
        faqChunks,
        responseLanguage,
      );
    }

    for await (const token of generator) {
      // Encode newlines so multi-line tokens don't break SSE framing.
      // The client decodes \n back to real newlines.
      const encoded = token.replace(/\n/g, "\\n");
      res.write(`data: ${encoded}\n\n`);
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.write(`data: [ERROR] ${message}\n\n`);
    res.end();
  }
});
