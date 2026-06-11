import { Router } from "express";
import type { Request, Response } from "express";
import { getRepositories } from "../../lib/db/index";
import { runIngestionPipeline } from "../../lib/rag/index";

export const reindexRouter = Router();

/**
 * POST /admin/reindex
 * Starts a new ingestion pipeline job.
 * Returns 409 if a job is already running.
 */
reindexRouter.post("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { reindexJobs } = await getRepositories();

    // Check for running job
    const runningJob = await reindexJobs.findOneBy({ status: "running" });

    if (runningJob) {
      res.status(409).json({
        error: "A reindex job is already running",
        jobId: runningJob.id,
      });
      return;
    }

    // Create a new job record
    const job = await reindexJobs.save(reindexJobs.create({ status: "pending" }));

    // Fire-and-forget background pipeline
    runIngestionPipeline(job.id).catch(console.error);

    res.status(202).json({ jobId: job.id, status: "started" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

/**
 * GET /admin/reindex
 * Returns the last 5 reindex jobs ordered by startedAt DESC.
 */
reindexRouter.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { reindexJobs } = await getRepositories();
    const jobs = await reindexJobs.find({
      order: { startedAt: "DESC" },
      take: 5,
    });

    res.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
