import "dotenv/config";

import { closeMigrationConnection, getMigrationStatus } from "../lib/db/migration-service";

async function main() {
  const status = await getMigrationStatus();
  const allMigrations = [
    ...status.executedMigrations.map((name) => ({ name, status: "up" })),
    ...status.pendingMigrations.map((name) => ({ name, status: "down" })),
  ];

  console.log("\n Status   Migration");
  console.log("----------------------------------------");

  for (const migration of allMigrations) {
    const label = migration.status === "up" ? "  up  " : " down ";
    console.log(`${label}   ${migration.name}`);
  }

  console.log("----------------------------------------");
  console.log(`\n Total: ${allMigrations.length} migrations`);
  console.log(`   Up: ${status.executed}`);
  console.log(` Down: ${status.pending}\n`);
}

main()
  .catch((error) => {
    console.error("Error checking migration status:", error);
    process.exit(1);
  })
  .finally(async () => {
    await closeMigrationConnection();
  });
