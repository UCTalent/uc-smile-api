import { describe, expect, it } from "vitest";

import { chunkFaqItems } from "./chunker";

const baseFaq = {
  id: "test-uuid",
  question: "What is the cost?",
  answer: "It costs $500.",
  category: "Pricing",
  sourceRow: 5,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

describe("chunkFaqItems", () => {
  it("returns empty array for empty input", () => {
    expect(chunkFaqItems([])).toHaveLength(0);
  });

  it("produces one qa_pair chunk for a short answer (≤ 400 chars)", () => {
    const chunks = chunkFaqItems([baseFaq]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.chunkType).toBe("qa_pair");
  });

  it("formats the qa_pair content correctly", () => {
    const chunks = chunkFaqItems([baseFaq]);
    expect(chunks[0].content).toBe(
      "Question: What is the cost?\nAnswer: It costs $500.",
    );
  });

  it("does NOT produce answer_only chunk when answer is exactly 400 chars", () => {
    const chunks = chunkFaqItems([{ ...baseFaq, answer: "A".repeat(400) }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].metadata.chunkType).toBe("qa_pair");
  });

  it("produces two chunks when answer length > 400 chars", () => {
    const longAnswer = "A".repeat(401);
    const chunks = chunkFaqItems([{ ...baseFaq, answer: longAnswer }]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].metadata.chunkType).toBe("qa_pair");
    expect(chunks[1].metadata.chunkType).toBe("answer_only");
    expect(chunks[1].content).toBe(longAnswer);
  });

  it("assigns the correct faqId to all chunks", () => {
    const longAnswer = "B".repeat(401);
    const chunks = chunkFaqItems([{ ...baseFaq, answer: longAnswer }]);
    for (const chunk of chunks) {
      expect(chunk.faqId).toBe("test-uuid");
    }
  });

  it("preserves category, sourceRow, and question in metadata", () => {
    const chunks = chunkFaqItems([baseFaq]);
    expect(chunks[0].metadata.category).toBe("Pricing");
    expect(chunks[0].metadata.sourceRow).toBe(5);
    expect(chunks[0].metadata.question).toBe("What is the cost?");
  });

  it("handles multiple FAQ items independently", () => {
    const items = [
      baseFaq,
      { ...baseFaq, id: "uuid-2", question: "Q2", answer: "A".repeat(500) },
    ];
    const chunks = chunkFaqItems(items);
    expect(chunks).toHaveLength(3); // 1 + 2
    expect(chunks[0].faqId).toBe("test-uuid");
    expect(chunks[1].faqId).toBe("uuid-2");
    expect(chunks[2].faqId).toBe("uuid-2");
  });
});
