import type { FaqItemEntity } from "./entities/faq-item.entity";
import type { ChunkMetadata, RagChunkEntity } from "./entities/rag-chunk.entity";
import type { ReindexJobEntity } from "./entities/reindex-job.entity";

export type FaqItem = FaqItemEntity;
export type RagChunk = RagChunkEntity;
export type ReindexJob = ReindexJobEntity;

export type RagChunkWithScore = RagChunk & {
  similarity: number;
  final_score?: number;
};

export type ChunkInput = {
  faqId: string;
  content: string;
  metadata: ChunkMetadata;
};

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type GeminiMessage = {
  role: "user" | "model";
  parts: [{ text: string }];
};
