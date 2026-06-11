import "dotenv/config";

import cors from "cors";
import express from "express";
import { initializeDataSource } from "./lib/db";
import { runPendingMigrations } from "./lib/db/migration-service";
import { adminAuthMiddleware } from "./middleware/admin-auth";
import { adminRouter } from "./routes/admin/index";
import { chatRouter } from "./routes/chat";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/chat", chatRouter);
app.use("/admin", adminAuthMiddleware, adminRouter);

function shouldRunMigrations() {
  const configuredValue = process.env.AUTO_RUN_MIGRATIONS;

  if (configuredValue !== undefined) {
    return configuredValue === "true";
  }

  return process.env.NODE_ENV === "production";
}

async function bootstrap() {
  if (shouldRunMigrations()) {
    await runPendingMigrations();
  } else {
    await initializeDataSource();
  }

  app.listen(PORT, () => {
    console.log(`[uc-smile-api] Running on port ${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("[uc-smile-api] Failed to start:", error);
  process.exit(1);
});
