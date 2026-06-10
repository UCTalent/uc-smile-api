import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export type ChunkMetadata = {
  question: string;
  category: string | null;
  sourceRow: number | null;
  chunkType: "qa_pair" | "answer_only";
};

export const faqItems = pgTable(
  "faq_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category"),
    sourceRow: integer("source_row").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("faq_items_source_row_unique").on(table.sourceRow)],
);

export const ragChunks = pgTable(
  "rag_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    faqId: uuid("faq_id").notNull().references(() => faqItems.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    metadata: jsonb("metadata").$type<ChunkMetadata>().notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rag_chunks_embedding_idx")
      .using("ivfflat", table.embedding.op("vector_cosine_ops"))
      .with({ lists: 50 }),
    index("rag_chunks_faq_id_idx").on(table.faqId),
  ],
);

export const reindexJobs = pgTable(
  "reindex_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").$type<"pending" | "running" | "done" | "failed">().notNull().default("pending"),
    totalRows: integer("total_rows"),
    indexedRows: integer("indexed_rows"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("reindex_jobs_status_idx").on(table.status)],
);
