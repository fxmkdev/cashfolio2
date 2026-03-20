-- AlterTable
ALTER TABLE "public"."AccountBook" ADD COLUMN     "cryptoHoldingGainLossAccountGroupId" TEXT,
ADD COLUMN     "fxHoldingGainLossAccountGroupId" TEXT,
ADD COLUMN     "securityHoldingGainLossAccountGroupId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."AccountBook" ADD CONSTRAINT "AccountBook_securityHoldingGainLossAccountGroupId_id_fkey" FOREIGN KEY ("securityHoldingGainLossAccountGroupId", "id") REFERENCES "public"."AccountGroup"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountBook" ADD CONSTRAINT "AccountBook_cryptoHoldingGainLossAccountGroupId_id_fkey" FOREIGN KEY ("cryptoHoldingGainLossAccountGroupId", "id") REFERENCES "public"."AccountGroup"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountBook" ADD CONSTRAINT "AccountBook_fxHoldingGainLossAccountGroupId_id_fkey" FOREIGN KEY ("fxHoldingGainLossAccountGroupId", "id") REFERENCES "public"."AccountGroup"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;
