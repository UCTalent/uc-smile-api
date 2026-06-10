import type { InferSelectModel } from "drizzle-orm";
import type { faqItems, ragChunks, reindexJobs } from "./schema";

export type FaqItem = InferSelectModel<typeof faqItems>;
export type RagChunk = InferSelectModel<typeof ragChunks>;
export type ReindexJob = InferSelectModel<typeof reindexJobs>;

export type RagChunkWithScore = RagChunk & {
  similarity: number;
  final_score?: number;
};

export type ChunkInput = {
  faqId: string;
  content: string;
  metadata: NonNullable<RagChunk["metadata"]>;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type GeminiMessage = {
  role: "user" | "model";
  parts: [{ text: string }];
};
