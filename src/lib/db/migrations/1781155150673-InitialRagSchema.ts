import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialRagSchema1781155150673 implements MigrationInterface {
  name = "InitialRagSchema1781155150673";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "faq_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "question" text NOT NULL,
        "answer" text NOT NULL,
        "category" text,
        "source_row" integer NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "faq_items_source_row_unique" UNIQUE("source_row")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rag_chunks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "faq_id" uuid NOT NULL,
        "content" text NOT NULL,
        "embedding" vector(768),
        "metadata" jsonb NOT NULL,
        "indexed_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reindex_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "status" text DEFAULT 'pending' NOT NULL,
        "total_rows" integer,
        "indexed_rows" integer,
        "error" text,
        "started_at" timestamp with time zone DEFAULT now() NOT NULL,
        "finished_at" timestamp with time zone
      )
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'faq_items_source_row_unique'
          AND conrelid = to_regclass('public.faq_items')
        ) THEN
          ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_source_row_unique" UNIQUE("source_row");
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'rag_chunks_faq_id_faq_items_id_fk'
          AND conrelid = to_regclass('public.rag_chunks')
        ) THEN
          ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_faq_id_faq_items_id_fk"
          FOREIGN KEY ("faq_id") REFERENCES "public"."faq_items"("id")
          ON DELETE cascade ON UPDATE no action;
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "rag_chunks_embedding_idx" ON "rag_chunks" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=50)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "rag_chunks_faq_id_idx" ON "rag_chunks" USING btree ("faq_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "reindex_jobs_status_idx" ON "reindex_jobs" USING btree ("status")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "reindex_jobs_status_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "rag_chunks_faq_id_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "rag_chunks_embedding_idx"`);
    await queryRunner.query(`ALTER TABLE IF EXISTS "rag_chunks" DROP CONSTRAINT IF EXISTS "rag_chunks_faq_id_faq_items_id_fk"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rag_chunks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "faq_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reindex_jobs"`);
  }
}
