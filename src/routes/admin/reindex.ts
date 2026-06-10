import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../../lib/db/index";
import { reindexJobs } from "../../lib/db/schema";
import { runIngestionPipeline } from "../../lib/rag/index";

export const reindexRouter = Router();

/**
 * POST /admin/reindex
 * Starts a new ingestion pipeline job.
 * Returns 409 if a job is already running.
 */
reindexRouter.post("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check for running job
    const runningJobs = await db
      .select()
      .from(reindexJobs)
      .where(eq(reindexJobs.status, "running"))
      .limit(1);

    if (runningJobs.length > 0) {
      res.status(409).json({
        error: "A reindex job is already running",
        jobId: runningJobs[0].id,
      });
      return;
    }

    // Create a new job record
    const [job] = await db
      .insert(reindexJobs)
      .values({ status: "pending" })
      .returning();

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
    const jobs = await db
      .select()
      .from(reindexJobs)
      .orderBy(desc(reindexJobs.startedAt))
      .limit(5);

    res.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});
