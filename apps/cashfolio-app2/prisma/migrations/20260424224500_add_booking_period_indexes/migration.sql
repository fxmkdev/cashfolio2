-- Period overview transfer-clearing query support indexes
CREATE INDEX "Booking_accountBookId_date_idx"
ON "public"."Booking"("accountBookId", "date");

CREATE INDEX "Booking_accountBookId_transactionId_date_idx"
ON "public"."Booking"("accountBookId", "transactionId", "date");
