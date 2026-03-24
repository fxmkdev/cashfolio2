-- Accounts page performance indexes
CREATE INDEX "Booking_accountBookId_accountId_idx" ON "public"."Booking"("accountBookId", "accountId");

CREATE INDEX "Account_accountBookId_isActive_type_equityAccountSubtype_idx"
ON "public"."Account"("accountBookId", "isActive", "type", "equityAccountSubtype");

CREATE INDEX "Account_accountBookId_groupId_isActive_idx"
ON "public"."Account"("accountBookId", "groupId", "isActive");

CREATE INDEX "AccountGroup_accountBookId_type_equityAccountSubtype_isActive_idx"
ON "public"."AccountGroup"("accountBookId", "type", "equityAccountSubtype", "isActive");

CREATE INDEX "AccountGroup_accountBookId_parentGroupId_isActive_idx"
ON "public"."AccountGroup"("accountBookId", "parentGroupId", "isActive");
