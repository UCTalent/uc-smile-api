import { count, ilike } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../../lib/db/index";
import { ragChunks } from "../../lib/db/schema";

export const chunksRouter = Router();

/**
 * GET /admin/chunks
 * Returns paginated chunks with optional text search.
 *
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 20, max: 100)
 *   - search (optional ILIKE match on content)
 *
 * Note: embedding field is excluded from response to avoid large payloads.
 */
chunksRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const offset = (page - 1) * limit;

    const whereClause = search ? ilike(ragChunks.content, `%${search}%`) : undefined;

    // Get total count
    const countResult = await db
      .select({ total: count() })
      .from(ragChunks)
      .where(whereClause);

    const total = countResult[0]?.total ?? 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch page of chunks (exclude embedding field)
    const data = await db
      .select({
        id: ragChunks.id,
        faqId: ragChunks.faqId,
        content: ragChunks.content,
        metadata: ragChunks.metadata,
        indexedAt: ragChunks.indexedAt,
      })
      .from(ragChunks)
      .where(whereClause)
      .orderBy(ragChunks.indexedAt)
      .limit(limit)
      .offset(offset);

    res.json({ data, total, page, totalPages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
