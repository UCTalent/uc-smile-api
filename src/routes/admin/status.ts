import { Router } from "express";
import type { Request, Response } from "express";
import { getRepositories } from "../../lib/db/index";

export const statusRouter = Router();

/**
 * GET /admin/status
 * Returns a reindex job by ID (via ?jobId=) or the latest job if no ID provided.
 * Returns 404 if no job is found.
 */
statusRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const jobId = typeof req.query.jobId === "string" ? req.query.jobId : null;
    const { reindexJobs } = await getRepositories();

    let job;

    if (jobId) {
      job = await reindexJobs.findOneBy({ id: jobId });
    } else {
      const results = await reindexJobs.find({
        order: { startedAt: "DESC" },
        take: 1,
      });
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
