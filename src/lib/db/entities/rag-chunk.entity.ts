import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { FaqItemEntity } from "./faq-item.entity";

export type ChunkMetadata = {
  question: string;
  category: string | null;
  sourceRow: number | null;
  chunkType: "qa_pair" | "answer_only";
};

@Entity({ name: "rag_chunks" })
@Index("rag_chunks_faq_id_idx", ["faqId"])
export class RagChunkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "faq_id", type: "uuid" })
  faqId!: string;

  @ManyToOne(() => FaqItemEntity, (faq) => faq.chunks, { onDelete: "CASCADE" })
  @JoinColumn({ name: "faq_id" })
  faq?: FaqItemEntity;

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "vector", length: "768", nullable: true, select: false })
  embedding!: number[] | string | null;

  @Column({ type: "jsonb" })
  metadata!: ChunkMetadata;

  @Column({ name: "indexed_at", type: "timestamptz", default: () => "now()" })
  indexedAt!: Date;
}
