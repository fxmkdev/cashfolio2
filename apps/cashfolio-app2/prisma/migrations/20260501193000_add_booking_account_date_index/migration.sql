-- Period overview query support index for account-scoped date aggregations
-- Replace redundant prefix index with the new composite index.
DROP INDEX IF EXISTS "public"."Booking_accountBookId_accountId_idx";

CREATE INDEX "Booking_accountBookId_accountId_date_idx"
ON "public"."Booking"("accountBookId", "accountId", "date");
