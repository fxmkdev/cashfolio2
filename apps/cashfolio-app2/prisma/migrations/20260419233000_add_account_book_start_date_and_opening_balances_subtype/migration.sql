ALTER TYPE "public"."EquityAccountSubtype" ADD VALUE 'OPENING_BALANCES';

ALTER TABLE "public"."AccountBook"
ADD COLUMN "startDate" TIMESTAMP(3);

WITH booking_min_date AS (
  SELECT
    b."accountBookId",
    date_trunc('day', MIN(b."date")) AS min_booking_day
  FROM "public"."Booking" b
  GROUP BY b."accountBookId"
)
UPDATE "public"."AccountBook" ab
SET "startDate" = COALESCE(
  bmd.min_booking_day + INTERVAL '1 day',
  date_trunc('day', ab."createdAt")
)
FROM booking_min_date bmd
WHERE bmd."accountBookId" = ab."id";

UPDATE "public"."AccountBook" ab
SET "startDate" = date_trunc('day', ab."createdAt")
WHERE ab."startDate" IS NULL;

WITH earliest_booking_day AS (
  SELECT
    b."accountBookId",
    date_trunc('day', MIN(b."date")) AS earliest_day
  FROM "public"."Booking" b
  GROUP BY b."accountBookId"
)
UPDATE "public"."Account" a
SET "equityAccountSubtype" = 'OPENING_BALANCES'
FROM earliest_booking_day ebd
WHERE a."accountBookId" = ebd."accountBookId"
  AND a."type" = 'EQUITY'
  AND a."equityAccountSubtype" = 'GAIN_LOSS'
  AND EXISTS (
    SELECT 1
    FROM "public"."Booking" b
    WHERE b."accountBookId" = a."accountBookId"
      AND b."accountId" = a."id"
      AND date_trunc('day', b."date") = ebd.earliest_day
  );

ALTER TABLE "public"."AccountBook"
ALTER COLUMN "startDate" SET NOT NULL;
