import { Router } from "express";
import type { Request, Response } from "express";
import type { Message } from "../lib/db/types";
import { ragQuery } from "../lib/rag/index";
import { rateLimiterMiddleware } from "../middleware/rate-limiter";

export const chatRouter = Router();

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
    for await (const token of ragQuery(message, history)) {
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
