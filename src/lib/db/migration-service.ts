import { QueryFailedError } from "typeorm";
import { AppDataSource, initializeDataSource } from "./data-source";

export type MigrationStatus = {
  executed: number;
  pending: number;
  executedMigrations: string[];
  pendingMigrations: string[];
};

function isMissingMigrationsTable(error: unknown): boolean {
  return error instanceof QueryFailedError && (error.driverError as { code?: string }).code === "42P01";
}

async function getExecutedMigrationNames(): Promise<string[]> {
  try {
    const rows = await AppDataSource.query(`SELECT name FROM migrations ORDER BY timestamp ASC`);
    return rows.map((row: { name: string }) => row.name);
  } catch (error) {
    if (isMissingMigrationsTable(error)) {
      return [];
    }

    throw error;
  }
}

export async function getMigrationStatus(): Promise<MigrationStatus> {
  await initializeDataSource();

  const allMigrationNames = AppDataSource.migrations.map((migration) => migration.name ?? migration.constructor.name);
  const executedNames = await getExecutedMigrationNames();
  const executedSet = new Set(executedNames);

  const executedMigrations = allMigrationNames.filter((name) => executedSet.has(name));
  const pendingMigrations = allMigrationNames.filter((name) => !executedSet.has(name));

  return {
    executed: executedMigrations.length,
    pending: pendingMigrations.length,
    executedMigrations,
    pendingMigrations,
  };
}

export async function runPendingMigrations(): Promise<void> {
  try {
    await initializeDataSource();
    console.log("[migrations] Checking for pending migrations...");

    const executedMigrations = await AppDataSource.runMigrations({
      transaction: "all",
    });

    if (executedMigrations.length === 0) {
      console.log("[migrations] No pending migrations");
      return;
    }

    console.log(`[migrations] Successfully executed ${executedMigrations.length} migration(s):`);
    for (const migration of executedMigrations) {
      console.log(`[migrations]   - ${migration.name}`);
    }
  } catch (error) {
    console.error("[migrations] Failed to run migrations:", error);

    if (process.env.NODE_ENV === "production") {
      console.error("[migrations] Migration failed in production. Application will exit.");
      process.exit(1);
    }

    throw error;
  }
}

export async function revertLastMigration(): Promise<void> {
  await initializeDataSource();
  console.log("[migrations] Reverting last migration...");
  await AppDataSource.undoLastMigration();
  console.log("[migrations] Successfully reverted last migration");
}

export async function closeMigrationConnection(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
