-- Requires a coordinated cutover: stop old application/database writers first.
-- Enum replacement and cache invalidation must commit together.
BEGIN;

DROP INDEX "public"."Account_gain_loss_unique_per_book";
DROP INDEX "public"."Account_opening_balances_unique_per_book";

CREATE TYPE "public"."AccountType_new" AS ENUM ('BALANCE', 'EQUITY');

ALTER TABLE "public"."Account"
ALTER COLUMN "type" TYPE "public"."AccountType_new"
USING (CASE WHEN "type"::text IN ('ASSET', 'LIABILITY') THEN 'BALANCE'
            ELSE "type"::text END)::"public"."AccountType_new";

ALTER TABLE "public"."AccountGroup"
ALTER COLUMN "type" TYPE "public"."AccountType_new"
USING (CASE WHEN "type"::text IN ('ASSET', 'LIABILITY') THEN 'BALANCE'
            ELSE "type"::text END)::"public"."AccountType_new";

DROP TYPE "public"."AccountType";
ALTER TYPE "public"."AccountType_new" RENAME TO "AccountType";

CREATE UNIQUE INDEX "Account_gain_loss_unique_per_book"
ON "public"."Account" ("accountBookId")
WHERE "type" = 'EQUITY' AND "equityAccountSubtype" = 'GAIN_LOSS';

CREATE UNIQUE INDEX "Account_opening_balances_unique_per_book"
ON "public"."Account" ("accountBookId")
WHERE "type" = 'EQUITY' AND "equityAccountSubtype" = 'OPENING_BALANCES';

-- ALTER COLUMN does not fire the statement-level data revision triggers.
UPDATE "public"."AccountBook" SET "periodCacheRevision" = gen_random_uuid();

COMMIT;
