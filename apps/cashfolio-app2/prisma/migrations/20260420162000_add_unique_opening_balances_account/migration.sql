WITH ranked_opening_accounts AS (
  SELECT
    a."id",
    a."accountBookId",
    first_value(a."id") OVER (
      PARTITION BY a."accountBookId"
      ORDER BY a."createdAt" ASC, a."id" ASC
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY a."accountBookId"
      ORDER BY a."createdAt" ASC, a."id" ASC
    ) AS row_number
  FROM "public"."Account" a
  WHERE a."type" = 'EQUITY'
    AND a."equityAccountSubtype" = 'OPENING_BALANCES'
), duplicate_opening_accounts AS (
  SELECT
    roa."id" AS drop_id,
    roa."accountBookId",
    roa.keep_id
  FROM ranked_opening_accounts roa
  WHERE roa.row_number > 1
)
UPDATE "public"."Booking" b
SET "accountId" = doa.keep_id
FROM duplicate_opening_accounts doa
WHERE b."accountBookId" = doa."accountBookId"
  AND b."accountId" = doa.drop_id;

WITH ranked_opening_accounts AS (
  SELECT
    a."id",
    a."accountBookId",
    row_number() OVER (
      PARTITION BY a."accountBookId"
      ORDER BY a."createdAt" ASC, a."id" ASC
    ) AS row_number
  FROM "public"."Account" a
  WHERE a."type" = 'EQUITY'
    AND a."equityAccountSubtype" = 'OPENING_BALANCES'
)
DELETE FROM "public"."Account" a
USING ranked_opening_accounts roa
WHERE a."id" = roa."id"
  AND a."accountBookId" = roa."accountBookId"
  AND roa.row_number > 1;

CREATE UNIQUE INDEX "Account_opening_balances_unique_per_book"
ON "public"."Account" ("accountBookId")
WHERE "type" = 'EQUITY'
  AND "equityAccountSubtype" = 'OPENING_BALANCES';
