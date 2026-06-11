import "dotenv/config";

import { closeMigrationConnection, revertLastMigration, runPendingMigrations } from "../lib/db/migration-service";

const command = process.argv[2] ?? "run";

async function main() {
  if (command !== "run" && command !== "revert") {
    console.error("Usage: tsx src/scripts/run-migration.ts [run|revert]");
    process.exit(1);
  }

  if (command === "run") {
    await runPendingMigrations();
  } else {
    await revertLastMigration();
  }
}

main()
  .catch(() => {
    process.exit(1);
  })
  .finally(async () => {
    await closeMigrationConnection();
  });
