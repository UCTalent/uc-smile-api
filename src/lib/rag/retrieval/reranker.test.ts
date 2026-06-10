import { describe, expect, it } from "vitest";

import type { RagChunkWithScore } from "../../db/types";
import { rerankChunks } from "./reranker";

function makeChunk(id: string, content: string, similarity: number): RagChunkWithScore {
  return {
    id,
    faqId: `faq-${id}`,
    content,
    embedding: null,
    metadata: {
      question: `question-${id}`,
      category: "General",
      sourceRow: 1,
      chunkType: "qa_pair",
    },
    indexedAt: new Date("2024-01-01"),
    similarity,
  };
}

describe("rerankChunks", () => {
  it("returns empty array for empty input", () => {
    expect(rerankChunks([], "query")).toHaveLength(0);
  });

  it("returns at most 4 results regardless of input size", () => {
    const chunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`c${i}`, `content ${i}`, 0.7),
    );
    expect(rerankChunks(chunks, "test")).toHaveLength(4);
  });

  it("returns all results when fewer than 4 chunks provided", () => {
    const chunks = [makeChunk("a", "dental implant", 0.8), makeChunk("b", "treatment", 0.7)];
    expect(rerankChunks(chunks, "implant")).toHaveLength(2);
  });

  it("assigns final_score to every result", () => {
    const chunks = [makeChunk("a", "implant cost", 0.8)];
    const results = rerankChunks(chunks, "implant");
    expect(results[0].final_score).toBeDefined();
    expect(typeof results[0].final_score).toBe("number");
  });

  it("sorts results by final_score descending", () => {
    const chunks = [
      makeChunk("low", "general content", 0.6),
      makeChunk("high", "implant cost pricing", 0.7),
      makeChunk("mid", "implant treatment", 0.65),
    ];
    const results = rerankChunks(chunks, "implant pricing");
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].final_score!).toBeGreaterThanOrEqual(results[i + 1].final_score!);
    }
  });

  it("boosts chunks that contain query keywords", () => {
    // 'a': similarity=0.75, no keyword match → final = 0.75*0.7 + 0*0.3 = 0.525
    // 'b': similarity=0.65, 2/2 keyword matches → final = 0.65*0.7 + 1*0.3 = 0.755
    const a = makeChunk("a", "general dental content", 0.75);
    const b = makeChunk("b", "implant pricing information", 0.65);
    const results = rerankChunks([a, b], "implant pricing");
    const aScore = results.find((r) => r.id === "a")!.final_score!;
    const bScore = results.find((r) => r.id === "b")!.final_score!;
    expect(bScore).toBeGreaterThan(aScore);
  });

  it("handles query with only stopwords (keyword_ratio = 0)", () => {
    const chunks = [makeChunk("a", "dental care", 0.8)];
    const results = rerankChunks(chunks, "the and or is");
    // No terms pass stopword filter → keyword_ratio = 0 → final = similarity * 0.7
    expect(results[0].final_score!).toBeCloseTo(0.8 * 0.7, 5);
  });

  it("computes final_score as 0.7*similarity + 0.3*keyword_ratio", () => {
    // query: 'implant' — 1 term, chunk matches 1/1 → keyword_ratio = 1.0
    // similarity = 0.9 → final = 0.9*0.7 + 1.0*0.3 = 0.63 + 0.3 = 0.93
    const chunk = makeChunk("a", "implant dental", 0.9);
    const results = rerankChunks([chunk], "implant");
    expect(results[0].final_score!).toBeCloseTo(0.93, 5);
  });
});
