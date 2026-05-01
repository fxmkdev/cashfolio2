-- Period overview query support index for account-scoped date aggregations
CREATE INDEX "Booking_accountBookId_accountId_date_idx"
ON "public"."Booking"("accountBookId", "accountId", "date");
