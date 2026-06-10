import type { ChunkInput, FaqItem } from "../../db/types";

/**
 * Splits FAQ items into text chunks for embedding.
 *
 * Each FAQ item produces:
 *   - A primary "qa_pair" chunk: "Question: {q}\nAnswer: {a}"
 *   - An optional secondary "answer_only" chunk when answer.length > 400,
 *     containing just the answer text for better retrieval of long answers.
 *
 * @example
 * // Input: [{id: 'abc', question: 'How much?', answer: 'It costs $500.', ...}]
 * // Output: [{ faqId: 'abc', content: 'Question: How much?\nAnswer: It costs $500.', metadata: { chunkType: 'qa_pair', ... } }]
 *
 * @param items - Array of FAQ items from the database
 * @returns Array of chunk inputs ready for embedding
 */
export function chunkFaqItems(items: FaqItem[]): ChunkInput[] {
  const chunks: ChunkInput[] = [];

  for (const item of items) {
    // Primary chunk: full Q&A pair
    chunks.push({
      faqId: item.id,
      content: `Question: ${item.question}\nAnswer: ${item.answer}`,
      metadata: {
        question: item.question,
        category: item.category,
        sourceRow: item.sourceRow,
        chunkType: "qa_pair",
      },
    });

    // Secondary chunk: answer only, for long answers
    if (item.answer.length > 400) {
      chunks.push({
        faqId: item.id,
        content: item.answer,
        metadata: {
          question: item.question,
          category: item.category,
          sourceRow: item.sourceRow,
          chunkType: "answer_only",
        },
      });
    }
  }

  return chunks;
}
