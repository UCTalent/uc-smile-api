import { Router } from "express";
import type { Request, Response } from "express";
import { getRepositories } from "../../lib/db/index";

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
    const { ragChunks } = await getRepositories();

    const baseQuery = ragChunks.createQueryBuilder("chunk");

    if (search) {
      baseQuery.where("chunk.content ILIKE :search", { search: `%${search}%` });
    }

    // Get total count
    const total = await baseQuery.getCount();
    const totalPages = Math.ceil(total / limit);

    // Fetch page of chunks (exclude embedding field)
    const dataQuery = ragChunks.createQueryBuilder("chunk");

    if (search) {
      dataQuery.where("chunk.content ILIKE :search", { search: `%${search}%` });
    }

    const data = await dataQuery
      .orderBy("chunk.indexedAt", "ASC")
      .take(limit)
      .skip(offset)
      .getMany();

    res.json({ data, total, page, totalPages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
