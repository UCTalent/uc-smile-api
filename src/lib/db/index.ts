import { AppDataSource, initializeDataSource } from "./data-source";
import { FaqItemEntity } from "./entities/faq-item.entity";
import { RagChunkEntity } from "./entities/rag-chunk.entity";
import { ReindexJobEntity } from "./entities/reindex-job.entity";

export { AppDataSource, initializeDataSource };
export { FaqItemEntity, RagChunkEntity, ReindexJobEntity };

export async function getRepositories() {
  const dataSource = await initializeDataSource();

  return {
    dataSource,
    faqItems: dataSource.getRepository(FaqItemEntity),
    ragChunks: dataSource.getRepository(RagChunkEntity),
    reindexJobs: dataSource.getRepository(ReindexJobEntity),
  };
}
