import { describe, expect, it } from "vitest";

import type { Message, RagChunkWithScore } from "../../db/types";
import { buildChatPrompt } from "./prompt-builder";

function makeChunk(question: string, content: string, category = "General"): RagChunkWithScore {
  return {
    id: "chunk-id",
    faqId: "faq-id",
    content,
    embedding: null,
    metadata: { question, category, sourceRow: 1, chunkType: "qa_pair" },
    indexedAt: new Date("2024-01-01"),
    similarity: 0.9,
    final_score: 0.9,
  };
}

describe("buildChatPrompt", () => {
  it("returns exactly one user message when history is empty", () => {
    const result = buildChatPrompt("hello?", [], []);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("embeds the user query in the single message (no history)", () => {
    const result = buildChatPrompt("my question", [], []);
    expect(result[0].parts[0].text).toContain("my question");
  });

  it("injects FAQ context block into the first user message", () => {
    const chunk = makeChunk("What is the price?", "It costs $500", "Pricing");
    const result = buildChatPrompt("price?", [chunk], []);
    const text = result[0].parts[0].text;
    expect(text).toContain("FAQ CONTEXT");
    expect(text).toContain("What is the price?");
    expect(text).toContain("It costs $500");
    expect(text).toContain("Pricing");
  });

  it("maps assistant history messages to Gemini 'model' role", () => {
    const history: Message[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
    ];
    const result = buildChatPrompt("query", [], history);
    const modelMsg = result.find((m) => m.role === "model");
    expect(modelMsg).toBeDefined();
    expect(modelMsg!.parts[0].text).toBe("reply");
  });

  it("maps user history messages to Gemini 'user' role", () => {
    const history: Message[] = [{ role: "user", content: "hello" }];
    const result = buildChatPrompt("query", [], history);
    const userMsgs = result.filter((m) => m.role === "user");
    expect(userMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it("appends the current query as the last message when history exists", () => {
    const history: Message[] = [
      { role: "user", content: "prior" },
      { role: "assistant", content: "response" },
    ];
    const result = buildChatPrompt("current query", [], history);
    const last = result[result.length - 1];
    expect(last.role).toBe("user");
    expect(last.parts[0].text).toBe("current query");
  });

  it("truncates history to at most 6 most recent messages", () => {
    const history: Message[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `msg-${i}`,
    }));
    const result = buildChatPrompt("query", [], history);
    // 6 history messages + 1 current query = 7 max
    expect(result.length).toBeLessThanOrEqual(7);
  });

  it("handles multiple chunks and numbers them correctly", () => {
    const chunks = [
      makeChunk("Q1", "Answer 1"),
      makeChunk("Q2", "Answer 2"),
    ];
    const result = buildChatPrompt("q?", chunks, []);
    const text = result[0].parts[0].text;
    expect(text).toContain("[1]");
    expect(text).toContain("[2]");
  });
});
