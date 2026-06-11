import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from "typeorm";
import { RagChunkEntity } from "./rag-chunk.entity";

@Entity({ name: "faq_items" })
@Unique("faq_items_source_row_unique", ["sourceRow"])
export class FaqItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  question!: string;

  @Column({ type: "text" })
  answer!: string;

  @Column({ type: "text", nullable: true })
  category!: string | null;

  @Column({ name: "source_row", type: "integer" })
  sourceRow!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  @OneToMany(() => RagChunkEntity, (chunk) => chunk.faq)
  chunks?: RagChunkEntity[];
}
