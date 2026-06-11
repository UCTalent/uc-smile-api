import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

export type ReindexJobStatus = "pending" | "running" | "done" | "failed";

@Entity({ name: "reindex_jobs" })
@Index("reindex_jobs_status_idx", ["status"])
export class ReindexJobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text", default: "pending" })
  status!: ReindexJobStatus;

  @Column({ name: "total_rows", type: "integer", nullable: true })
  totalRows!: number | null;

  @Column({ name: "indexed_rows", type: "integer", nullable: true })
  indexedRows!: number | null;

  @Column({ type: "text", nullable: true })
  error!: string | null;

  @Column({ name: "started_at", type: "timestamptz", default: () => "now()" })
  startedAt!: Date;

  @Column({ name: "finished_at", type: "timestamptz", nullable: true })
  finishedAt!: Date | null;
}
