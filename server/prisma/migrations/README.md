# Migrations

The schema used to be applied only with `prisma db push`, which rewrites the database to match
`schema.prisma` with no history and no review step. That is fine on a laptop and wrong for a
deployment holding real submissions: there is no record of what changed, no way to see the SQL
before it runs, and nothing to roll back to.

`0_init` is a baseline generated from the current schema.

## First deploy (empty database)

```bash
npm run prisma:migrate
```

## Existing database already created with `db push`

Tell Prisma the baseline is already applied, then deploy normally from here on:

```bash
npx prisma migrate resolve --applied 0_init
npm run prisma:migrate
```

## Changing the schema from now on

```bash
npx prisma migrate dev --name what_changed   # writes a new migration + applies it locally
```

Commit the generated folder. `npm run prisma:migrate` (`prisma migrate deploy`) is the only
command that should ever touch a production database.
