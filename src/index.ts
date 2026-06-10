import "dotenv/config";

import cors from "cors";
import express from "express";
import { adminAuthMiddleware } from "./middleware/admin-auth";
import { adminRouter } from "./routes/admin/index";
import { reindexRouter } from "./routes/admin/reindex";
import { chatRouter } from "./routes/chat";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/chat", chatRouter);
app.use("/admin/reindex", reindexRouter);                   // no auth required
app.use("/admin", adminAuthMiddleware, adminRouter);         // auth required

app.listen(PORT, () => {
  console.log(`[uc-smile-api] Running on port ${PORT}`);
});
