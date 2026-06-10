import type { RagChunkWithScore } from "../../db/types";

const STOPWORDS = new Set([
  // English
  "at", "the", "is", "are", "was", "were", "a", "an", "of", "to", "in", "it",
  "and", "or", "but", "for", "on", "with", "as", "by", "from", "that", "this",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can",
  // Vietnamese
  "và", "là", "của", "với", "cho", "có", "không", "được", "này", "đó",
  "một", "những", "các", "tôi", "bạn", "họ", "chúng", "ta", "mình",
  "thì", "mà", "nhưng", "hay", "hoặc", "nếu", "vì", "bởi", "khi",
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
      keywordRatio = matchCount / queryTerms.length;
    }

    const finalScore = chunk.similarity * 0.7 + keywordRatio * 0.3;

    return { ...chunk, final_score: finalScore };
  });

  // Sort by final_score descending and return top 6
  return scored
    .sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0))
    .slice(0, 6);
}
