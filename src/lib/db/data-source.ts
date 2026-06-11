import "dotenv/config";
import "reflect-metadata";

import path from "node:path";
import { DataSource } from "typeorm";
import { FaqItemEntity } from "./entities/faq-item.entity";
import { RagChunkEntity } from "./entities/rag-chunk.entity";
import { ReindexJobEntity } from "./entities/reindex-job.entity";

const migrationGlobs = [path.join(__dirname, "migrations", "*{.ts,.js}")];

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [FaqItemEntity, RagChunkEntity, ReindexJobEntity],
  migrations: migrationGlobs,
  synchronize: false,
  migrationsRun: false,
  logging: false,
  installExtensions: false,
  migrationsTransactionMode: "each",
  extra: { options: "-c timezone=UTC" },
});

export async function initializeDataSource(): Promise<DataSource> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  return AppDataSource;
}
