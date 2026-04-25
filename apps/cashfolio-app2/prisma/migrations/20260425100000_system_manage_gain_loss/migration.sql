CREATE TEMP TABLE "_old_gain_loss_accounts" AS
SELECT
  a."id",
  a."accountBookId"
FROM "public"."Account" a
WHERE a."type" = 'EQUITY'
  AND a."equityAccountSubtype" = 'GAIN_LOSS';

CREATE TEMP TABLE "_canonical_gain_loss_accounts" AS
SELECT
  ab."id" AS "accountBookId",
  gen_random_uuid()::text AS "id"
FROM "public"."AccountBook" ab;

INSERT INTO "public"."Account" (
  "id",
  "name",
  "type",
  "equityAccountSubtype",
  "isActive",
  "groupId",
  "accountBookId",
  "createdAt",
  "updatedAt"
)
SELECT
  c."id",
  'Gain/Loss',
  'EQUITY',
  'GAIN_LOSS',
  true,
  NULL,
  c."accountBookId",
  NOW(),
  NOW()
FROM "_canonical_gain_loss_accounts" c;

UPDATE "public"."Booking" b
SET "accountId" = c."id"
FROM "_old_gain_loss_accounts" o
JOIN "_canonical_gain_loss_accounts" c
  ON c."accountBookId" = o."accountBookId"
WHERE b."accountBookId" = o."accountBookId"
  AND b."accountId" = o."id";

DELETE FROM "public"."Account" a
USING "_old_gain_loss_accounts" o
WHERE a."id" = o."id"
  AND a."accountBookId" = o."accountBookId";

ALTER TABLE "public"."AccountBook"
DROP CONSTRAINT IF EXISTS "AccountBook_securityHoldingGainLossAccountGroupId_id_fkey";

ALTER TABLE "public"."AccountBook"
DROP CONSTRAINT IF EXISTS "AccountBook_cryptoHoldingGainLossAccountGroupId_id_fkey";

ALTER TABLE "public"."AccountBook"
DROP CONSTRAINT IF EXISTS "AccountBook_fxHoldingGainLossAccountGroupId_id_fkey";

ALTER TABLE "public"."AccountBook"
DROP COLUMN IF EXISTS "securityHoldingGainLossAccountGroupId",
DROP COLUMN IF EXISTS "cryptoHoldingGainLossAccountGroupId",
DROP COLUMN IF EXISTS "fxHoldingGainLossAccountGroupId";

CREATE TEMP TABLE "_gain_loss_groups" AS
SELECT
  g."id",
  g."accountBookId"
FROM "public"."AccountGroup" g
WHERE g."equityAccountSubtype" = 'GAIN_LOSS';

UPDATE "public"."Account" a
SET "groupId" = NULL
FROM "_gain_loss_groups" g
WHERE a."accountBookId" = g."accountBookId"
  AND a."groupId" = g."id";

UPDATE "public"."AccountGroup" child
SET "parentGroupId" = NULL
FROM "_gain_loss_groups" g
WHERE child."accountBookId" = g."accountBookId"
  AND child."parentGroupId" = g."id";

DELETE FROM "public"."AccountGroup" g
USING "_gain_loss_groups" doomed
WHERE g."id" = doomed."id"
  AND g."accountBookId" = doomed."accountBookId";

ALTER TABLE "public"."AccountGroup"
DROP CONSTRAINT IF EXISTS "AccountGroup_no_gain_loss_subtype";

ALTER TABLE "public"."AccountGroup"
ADD CONSTRAINT "AccountGroup_no_gain_loss_subtype"
CHECK (
  "equityAccountSubtype" IS NULL
  OR "equityAccountSubtype" <> 'GAIN_LOSS'
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_gain_loss_unique_per_book"
ON "public"."Account" ("accountBookId")
WHERE "type" = 'EQUITY'
  AND "equityAccountSubtype" = 'GAIN_LOSS';

CREATE OR REPLACE FUNCTION "public"."ensure_gain_loss_account_for_new_book"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "public"."Account" (
    "id",
    "name",
    "type",
    "equityAccountSubtype",
    "isActive",
    "groupId",
    "accountBookId",
    "createdAt",
    "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    'Gain/Loss',
    'EQUITY',
    'GAIN_LOSS',
    true,
    NULL,
    NEW."id",
    NOW(),
    NOW()
  WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."Account" a
    WHERE a."accountBookId" = NEW."id"
      AND a."type" = 'EQUITY'
      AND a."equityAccountSubtype" = 'GAIN_LOSS'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AccountBook_ensure_gain_loss_account" ON "public"."AccountBook";

CREATE TRIGGER "AccountBook_ensure_gain_loss_account"
AFTER INSERT ON "public"."AccountBook"
FOR EACH ROW
EXECUTE FUNCTION "public"."ensure_gain_loss_account_for_new_book"();

DROP TABLE "_gain_loss_groups";
DROP TABLE "_canonical_gain_loss_accounts";
DROP TABLE "_old_gain_loss_accounts";
