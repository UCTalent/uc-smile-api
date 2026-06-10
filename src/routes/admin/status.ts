import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../../lib/db/index";
import { reindexJobs } from "../../lib/db/schema";

export const statusRouter = Router();

/**
 * GET /admin/status
 * Returns a reindex job by ID (via ?jobId=) or the latest job if no ID provided.
 * Returns 404 if no job is found.
 */
statusRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : null;

    let job;

    if (jobId) {
      const results = await db
        .select()
        .from(reindexJobs)
        .where(eq(reindexJobs.id, jobId))
        .limit(1);
      job = results[0] ?? null;
    } else {
      const results = await db
        .select()
        .from(reindexJobs)
        .orderBy(desc(reindexJobs.startedAt))
        .limit(1);
      job = results[0] ?? null;
    }

    if (!job) {
      res.status(404).json({ error: "No reindex job found" });
      return;
    }

    res.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
