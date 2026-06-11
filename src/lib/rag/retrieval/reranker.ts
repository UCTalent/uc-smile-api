import type { RagChunkWithScore } from "../../db/types";

// Only truly meaningless function words — do NOT add intent-bearing terms like
// "không" (negation), "nếu" (conditional), "vì"/"bởi" (causal), "khi" (temporal),
// or question words like "bao", "nhiêu", "sao", "đâu" which signal user intent.
const STOPWORDS = new Set([
  // English
  "at", "the", "is", "are", "was", "were", "a", "an", "of", "to", "in", "it",
  "and", "or", "but", "for", "on", "with", "as", "by", "from", "that", "this",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can",
  // Vietnamese — conjunctions, articles, pronouns with no discriminative value
  "và", "là", "của", "với", "cho", "có", "được", "này", "đó",
  "một", "những", "các",
  "tôi", "bạn", "họ", "chúng", "ta", "mình",
  "thì", "mà", "nhưng", "hay", "hoặc",
]);

/**
 * Re-ranks retrieved chunks using a combination of vector similarity and keyword matching.
 *
 * Algorithm:
 *   1. Tokenize the query and filter out stopwords
 *   2. Count keyword matches in each chunk's content (case-insensitive)
 *   3. Compute keyword_ratio = matches / queryTerms.length
 *   4. final_score = similarity * 0.7 + keyword_ratio * 0.3
 *   5. Sort by final_score DESC and return top 4
 *
 * @param chunks - Chunks from vector search with similarity scores
 * @param query - The original user query text
 * @returns Top 4 re-ranked chunks with final_score set
 */
export function rerankChunks(
  chunks: RagChunkWithScore[],
  query: string,
): RagChunkWithScore[] {
  // Tokenize query: split on whitespace and punctuation, lowercase, filter stopwords
  const queryTerms = query
    .toLowerCase()
    .split(/[\s,?.!;:()\[\]{}"']+/)
    .filter((term) => term.length > 1 && !STOPWORDS.has(term));

  const scored = chunks.map((chunk) => {
    let keywordRatio = 0;

    if (queryTerms.length > 0) {
      const contentLower = chunk.content.toLowerCase();
      const matchCount = queryTerms.filter((term) => contentLower.includes(term)).length;
      // Divide by sqrt(length) instead of length to reduce long-query bias.
      // e.g. "implant" (1 term, 1 match) → 1.0; "chi phí implant bao nhiêu"
      // (4 terms, 1 match) → 0.5 — more equitable than 1/4 = 0.25.
      keywordRatio = Math.min(matchCount / Math.sqrt(queryTerms.length), 1.0);
    }

    const finalScore = chunk.similarity * 0.7 + keywordRatio * 0.3;

    return { ...chunk, final_score: finalScore };
  });

  // Deduplicate by faqId: qa_pair and answer_only from the same FAQ contain
  // the same answer text, so sending both wastes a context slot.
  // Always prefer qa_pair (it has question + answer) over answer_only.
  // Among chunks of the same type, prefer higher final_score.
  const byFaqId = new Map<string, RagChunkWithScore>();
  for (const chunk of scored) {
    const existing = byFaqId.get(chunk.faqId);
    if (!existing) {
      byFaqId.set(chunk.faqId, chunk);
    } else {
      // Prefer qa_pair regardless of score; otherwise keep higher score
      const incomingIsQaPair = chunk.metadata?.chunkType === "qa_pair";
      const existingIsQaPair = existing.metadata?.chunkType === "qa_pair";
      if (incomingIsQaPair && !existingIsQaPair) {
        byFaqId.set(chunk.faqId, chunk);
      } else if (!incomingIsQaPair && existingIsQaPair) {
        // keep existing
      } else if ((chunk.final_score ?? 0) > (existing.final_score ?? 0)) {
        byFaqId.set(chunk.faqId, chunk);
      }
    }
  }

  return [...byFaqId.values()]
    .sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
    .slice(0, 6);
}
