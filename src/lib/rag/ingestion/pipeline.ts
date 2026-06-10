import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { faqItems, ragChunks, reindexJobs } from "../../db/schema";
import { chunkFaqItems } from "./chunker";
import { embedBatch } from "./embedder";
import { loadFaqFromSheet } from "./sheet-loader";

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] [Pipeline] ${message}`);
}

/**
 * Runs the full ingestion pipeline for a given reindex job.
 *
 * Steps:
 *   1. Mark job as running
 *   2. Load FAQ rows from Google Sheet
 *   3. Upsert faq_items (by sourceRow)
 *   4. Chunk all items
 *   5. Embed all chunks in batches
 *   6. In a transaction: delete old chunks, insert new chunks with embeddings
 *   7. Mark job as done (or failed on error)
 *
 * This function is intended to be called without await (fire-and-forget background job).
 *
 * @param jobId - UUID of the reindex_jobs row to update
 */
export async function runIngestionPipeline(jobId: string): Promise<void> {
  try {
    // Step 1: Mark job as running
    await db
      .update(reindexJobs)
      .set({ status: "running" })
      .where(eq(reindexJobs.id, jobId));

    log(`Job ${jobId} started`);

    // Step 2: Load FAQ from Google Sheet
    log("Loading FAQ from Google Sheet...");
    const sheetRows = await loadFaqFromSheet();
    log(`Loaded ${sheetRows.length} rows from sheet`);

    // Step 3: Upsert faq_items
    log("Upserting FAQ items...");
    const now = new Date();
    const upsertedItems = await db
      .insert(faqItems)
      .values(
        sheetRows.map((row) => ({
          question: row.question,
          answer: row.answer,
          category: row.category,
          sourceRow: row.sourceRow,
        })),
      )
      .onConflictDoUpdate({
        target: faqItems.sourceRow,
        set: {
          question: faqItems.question,
          answer: faqItems.answer,
          category: faqItems.category,
          updatedAt: now,
        },
      })
      .returning();

    log(`Upserted ${upsertedItems.length} FAQ items`);

    // Step 4: Chunk all items
    log("Chunking FAQ items...");
    const chunks = chunkFaqItems(upsertedItems);
    log(`Generated ${chunks.length} chunks`);

    // Step 5: Embed all chunks in batches, update progress every 20
    log("Embedding chunks...");
    const contents = chunks.map((c) => c.content);
    const embeddings: number[][] = [];
    const batchSize = 20;

    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      const batchEmbeddings = await embedBatch(batch);
      embeddings.push(...batchEmbeddings);

      // Update progress
      await db
        .update(reindexJobs)
        .set({ indexedRows: Math.min(i + batchSize, contents.length) })
        .where(eq(reindexJobs.id, jobId));

      log(`Embedded ${Math.min(i + batchSize, contents.length)}/${contents.length} chunks`);
    }

    // Step 6: Transaction — delete old chunks, insert new chunks
    log("Replacing chunks in database...");
    const faqIds = [...new Set(upsertedItems.map((item) => item.id))];

    await db.transaction(async (tx) => {
      // Delete existing chunks for all affected FAQ items
      if (faqIds.length > 0) {
        await tx.delete(ragChunks).where(inArray(ragChunks.faqId, faqIds));
      }

      // Insert new chunks with embeddings
      // pgvector requires the embedding cast via SQL literal
      if (chunks.length > 0) {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const vectorStr = `[${embeddings[i].join(",")}]`;
          await tx.insert(ragChunks).values({
            faqId: chunk.faqId,
            content: chunk.content,
            embedding: sql`${vectorStr}::vector`,
            metadata: chunk.metadata,
          });
        }
      }
    });

    log(`Inserted ${chunks.length} chunks`);

    // Step 7: Mark job as done
    await db
      .update(reindexJobs)
      .set({
        status: "done",
        totalRows: upsertedItems.length,
        indexedRows: chunks.length,
        finishedAt: new Date(),
      })
      .where(eq(reindexJobs.id, jobId));

    log(`Job ${jobId} completed successfully`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Job ${jobId} failed: ${message}`);

    await db
      .update(reindexJobs)
      .set({
        status: "failed",
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(reindexJobs.id, jobId))
      .catch((updateErr: unknown) => {
        const updateMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
        log(`Failed to update job status to failed: ${updateMessage}`);
      });
  }
}
