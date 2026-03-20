-- CreateEnum
CREATE TYPE "public"."EquityAccountSubtype" AS ENUM ('GAIN_LOSS', 'INCOME', 'EXPENSE');

-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "equityAccountSubtype" "public"."EquityAccountSubtype";

-- AlterTable
ALTER TABLE "public"."AccountGroup" ADD COLUMN     "equityAccountSubtype" "public"."EquityAccountSubtype";
