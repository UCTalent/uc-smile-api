import { getRepositories } from "../../db";
import type { FaqItem } from "../../db/types";
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
    const { dataSource, reindexJobs } = await getRepositories();

    // Step 1: Mark job as running
    await reindexJobs.update({ id: jobId }, { status: "running" });

    log(`Job ${jobId} started`);

    // Step 2: Load FAQ from Google Sheet
    log("Loading FAQ from Google Sheet...");
    const sheetRows = await loadFaqFromSheet();
    log(`Loaded ${sheetRows.length} rows from sheet`);

    // Step 3: Upsert faq_items
    log("Upserting FAQ items...");
    const now = new Date();
    const upsertValues: unknown[] = [];
    const valuePlaceholders = sheetRows.map((row, index) => {
      const base = index * 5;
      upsertValues.push(row.question, row.answer, row.category, row.sourceRow, now);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    const upsertedItems = (await dataSource.query(
      `
        INSERT INTO faq_items (question, answer, category, source_row, updated_at)
        VALUES ${valuePlaceholders.join(", ")}
        ON CONFLICT (source_row)
        DO UPDATE SET
          question = EXCLUDED.question,
          answer = EXCLUDED.answer,
          category = EXCLUDED.category,
          updated_at = EXCLUDED.updated_at
        RETURNING
          id,
          question,
          answer,
          category,
          source_row AS "sourceRow",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      upsertValues,
    )) as FaqItem[];

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
      await reindexJobs.update({ id: jobId }, { indexedRows: Math.min(i + batchSize, contents.length) });

      log(`Embedded ${Math.min(i + batchSize, contents.length)}/${contents.length} chunks`);
    }

    // Step 6: Transaction — delete old chunks, insert new chunks
    log("Replacing chunks in database...");
    const faqIds = [...new Set(upsertedItems.map((item) => item.id))];

    const queryRunner = dataSource.createQueryRunner();
    let transactionStarted = false;
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

      // Delete existing chunks for all affected FAQ items
      if (faqIds.length > 0) {
        await queryRunner.query(
          `DELETE FROM rag_chunks WHERE faq_id = ANY($1::uuid[])`,
          [faqIds],
        );
      }

      // Insert new chunks with embeddings using raw SQL so the vector
      // string is passed as a plain text parameter with an explicit ::vector cast
      // in the SQL itself — this guarantees pgvector receives the correct type.
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vectorStr = `[${embeddings[i].join(",")}]`;
        await queryRunner.query(
          `INSERT INTO rag_chunks (faq_id, content, embedding, metadata)
           VALUES ($1, $2, $3::vector, $4)`,
          [chunk.faqId, chunk.content, vectorStr, JSON.stringify(chunk.metadata)],
        );
      }

      await queryRunner.commitTransaction();
      transactionStarted = false;
    } catch (txErr) {
      if (transactionStarted) {
        await queryRunner.rollbackTransaction();
      }
      throw txErr;
    } finally {
      await queryRunner.release();
    }

    log(`Inserted ${chunks.length} chunks`);

    // Step 7: Mark job as done
    await reindexJobs.update(
      { id: jobId },
      {
        status: "done",
        totalRows: upsertedItems.length,
        indexedRows: chunks.length,
        finishedAt: new Date(),
      },
    );

    log(`Job ${jobId} completed successfully`);
  } catch (err) {
    // Log root cause first when the database driver wraps the original pg error.
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : undefined;
    const message = cause ? cause.message : err instanceof Error ? err.message : String(err);
    log(`Job ${jobId} failed: ${message}`);
    if (cause) log(`Database context: ${(err as Error).message.split("\n")[0]}`);

    const { reindexJobs } = await getRepositories();
    await reindexJobs
      .update(
        { id: jobId },
        {
          status: "failed",
          error: message,
          finishedAt: new Date(),
        },
      )
      .catch((updateErr: unknown) => {
        const updateMessage = updateErr instanceof Error ? updateErr.message : String(updateErr);
        log(`Failed to update job status to failed: ${updateMessage}`);
      });
  }
}
