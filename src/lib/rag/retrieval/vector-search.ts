import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { RagChunkWithScore } from "../../db/types";
import { toVectorString } from "../ingestion/embedder";

type RawChunkRow = {
  id: string;
  faq_id: string;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  indexed_at: Date;
  similarity: number;
};

/**
 * Searches for FAQ chunks similar to the given query embedding using pgvector cosine similarity.
 *
 * Only returns chunks with similarity > 0.65.
 * Results are ordered by cosine distance (closest first).
 *
 * @param queryEmbedding - 768-dimensional embedding vector of the user query
 * @param topK - Maximum number of results to return (default: 10)
 * @returns Array of chunks with similarity scores
 */
export async function searchSimilarChunks(
  queryEmbedding: number[],
  topK = 10,
): Promise<RagChunkWithScore[]> {
  const vectorStr = toVectorString(queryEmbedding);

  const rows = await db.execute<RawChunkRow>(
    sql`
      SELECT
        id,
        faq_id,
        content,
        embedding,
        metadata,
        indexed_at,
        1 - (embedding <=> ${sql.raw(`'${vectorStr}'`)}::vector) AS similarity
      FROM rag_chunks
      WHERE 1 - (embedding <=> ${sql.raw(`'${vectorStr}'`)}::vector) > 0.65
      ORDER BY embedding <=> ${sql.raw(`'${vectorStr}'`)}::vector
      LIMIT ${sql.raw(String(topK))}
    `,
  );

  return rows.rows.map((row) => ({
    id: row.id,
    faqId: row.faq_id,
    content: row.content,
    embedding: row.embedding,
    metadata: row.metadata as RagChunkWithScore["metadata"],
    indexedAt: row.indexed_at,
    similarity: Number(row.similarity),
  }));
}
