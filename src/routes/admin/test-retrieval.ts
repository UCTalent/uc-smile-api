import { Router } from "express";
import type { Request, Response } from "express";
import { embedText } from "../../lib/rag/ingestion/embedder";
import { rerankChunks } from "../../lib/rag/retrieval/reranker";
import { searchSimilarChunks } from "../../lib/rag/retrieval/vector-search";

export const testRetrievalRouter = Router();

type TestRetrievalBody = {
  query?: unknown;
};

/**
 * POST /admin/test-retrieval
 * Tests the embed → search → rerank pipeline without calling the LLM.
 *
 * Body: { query: string }
 * Returns: { query, results: [{ content, similarity, final_score, metadata }] }
 */
testRetrievalRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = req.body as TestRetrievalBody;

  if (typeof body.query !== "string" || body.query.trim() === "") {
    res.status(400).json({ error: "query must be a non-empty string" });
    return;
  }

  const query = body.query.trim();

  try {
    // Embed query
    const queryEmbedding = await embedText(query);

    // Vector search
    const searchResults = await searchSimilarChunks(queryEmbedding, 10);

    // Rerank
    const reranked = rerankChunks(searchResults, query);

    const results = reranked.map((chunk) => ({
      content: chunk.content,
      similarity: chunk.similarity,
      final_score: chunk.final_score,
      metadata: chunk.metadata,
    }));

    res.json({ query, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
