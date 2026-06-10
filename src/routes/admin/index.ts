import { Router } from "express";
import { chunksRouter } from "./chunks";
import { reindexRouter } from "./reindex";
import { statusRouter } from "./status";
import { testRetrievalRouter } from "./test-retrieval";

export const adminRouter = Router();

adminRouter.use("/reindex", reindexRouter);
adminRouter.use("/status", statusRouter);
adminRouter.use("/chunks", chunksRouter);
adminRouter.use("/test-retrieval", testRetrievalRouter);
