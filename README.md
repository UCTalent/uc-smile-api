# uc-smile-api

Backend API for the UC Smile project.

## Database Commands

Run these commands from the project root: `/home/nhat/uctalent/uc-smile-api`.

### `pnpm run migration:create`
Create a new blank migration file.

Use this when you want a migration skeleton and will fill the SQL yourself.

Example:

```bash
pnpm run migration:create
```

This creates a file in `src/lib/db/migrations` with a timestamp prefix, for example:

```bash
1781167493789-Migration.ts
```

### `pnpm run migration:generate`
Generate a migration from TypeORM metadata.

Use this when you already changed entities and want TypeORM to detect schema differences.

Example:

```bash
pnpm run migration:generate
```

This command runs the build first, then generates a migration file in `src/lib/db/migrations`.

### `pnpm run migration:run`
Run all pending migrations.

Use this after creating or generating migrations to apply them to the database.

Example:

```bash
pnpm run migration:run
```

### `pnpm run migration:revert`
Revert the last migration.

Use this when you need to roll back the most recent migration.

Example:

```bash
pnpm run migration:revert
```

### `pnpm run migration:show`
Show migration status.

Use this to check which migrations have already been applied.

Example:

```bash
pnpm run migration:show
```

## Other Database Helpers

### `pnpm run db:setup`
Shortcut for `pnpm run migration:run`.

### `pnpm run db:migrate`
Shortcut for `pnpm run migration:run`.

### `pnpm run typeorm`
Direct access to the TypeORM CLI.

Example:

```bash
pnpm run typeorm -- help
```

## Notes

- `migration:create` is for a blank migration file.
- `migration:generate` is for schema changes derived from entities.
- `migration:run` and `migration:revert` both compile the project before executing.
- If you want a custom migration name with TypeORM directly, use:

```bash
pnpm typeorm migration:create src/lib/db/migrations/AddFaqTable
```
