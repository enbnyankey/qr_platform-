# Release and rollback

How Phase 1 moves through the plan's stage gates and how to undo a bad release.

## Before every release (Gate 3 → Gate 4)

- [ ] CI is green on the release commit (tests, typecheck, web build). See `.github/workflows/ci.yml`.
- [ ] UAT sign-off recorded for the stories in this release.
- [ ] Database backup taken (or point-in-time recovery confirmed) **before** running migrations.
- [ ] New migrations reviewed: `packages/db/prisma/migrations/<new>/migration.sql`. Prefer additive changes (new tables/columns) so the previous app version still works against the new schema.
- [ ] Environment variables for any new settings added in the target environment.
- [ ] Monitoring checked: API `/health`, resolver `/health`, error rate in logs.

## Release steps

1. Deploy the **QR resolver** first if it changed. It is small and printed codes depend on it.
2. Run migrations once: `npm run migrate` (Prisma `migrate deploy`).
3. Deploy the **API**, then the **web app**.
4. Smoke test (5 minutes):
   - Sign in, open Overview.
   - Create a QR code, scan it on a phone, see it counted.
   - Change its destination, scan again, land on the new destination.
   - Open a published menu from its code.
5. Watch logs for 30 minutes (hypercare). Every request has an `X-Request-Id` to trace issues.

## Rolling back

| What broke | Do this |
|---|---|
| Web app | Redeploy the previous web build. No data impact. |
| API | Redeploy the previous API build. Safe as long as the migration was additive. |
| Resolver | Redeploy the previous resolver build immediately. Printed codes depend on it. |
| A migration | Prisma does not auto-reverse migrations. Write a new migration that undoes the change and deploy it, or restore the pre-release backup if data was damaged. Never edit an applied migration file. |

## Definition of Done (from the delivery plan)

A Phase 1 change is done when it has tests (`apps/api/test`), passes CI, has been checked on desktop and phone widths, updates `docs/USER_GUIDE.md` or `docs/ADMIN_GUIDE.md` if users see it, and has a rollback path above.
