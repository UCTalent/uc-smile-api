# Migration README

## Create migration (default TypeORM)

Run this from the API project root:

```bash
pnpm run migration:create
```

This command creates a blank migration in `src/lib/db/migrations` with default name suffix `Migration`, for example:

`1781167493789-Migration.ts`

If you want a custom name, use TypeORM command directly:

```bash
pnpm typeorm migration:create src/lib/db/migrations/AddFaqTable
```

TypeORM default template may include `public async` methods and no `name` property.

## Other migration commands

```bash
pnpm run migration:generate
pnpm run migration:run
pnpm run migration:revert
pnpm run migration:show
```
