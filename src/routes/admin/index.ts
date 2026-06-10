import { Router } from "express";
import { chunksRouter } from "./chunks";
import { statusRouter } from "./status";
import { testRetrievalRouter } from "./test-retrieval";

// reindexRouter is mounted at top-level without auth — see src/index.ts
export const adminRouter = Router();

adminRouter.use("/status", statusRouter);
adminRouter.use("/chunks", chunksRouter);
adminRouter.use("/test-retrieval", testRetrievalRouter);
