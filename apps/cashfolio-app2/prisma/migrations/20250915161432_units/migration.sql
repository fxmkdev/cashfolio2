/*
  Warnings:

  - The `unit` column on the `Account` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."Unit" AS ENUM ('CURRENCY', 'CRYPTOCURRENCY', 'SECURITY');

-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "cryptocurrency" TEXT,
DROP COLUMN "unit",
ADD COLUMN     "unit" "public"."Unit";

-- AlterTable
ALTER TABLE "public"."Booking" ADD COLUMN     "cryptocurrency" TEXT,
ADD COLUMN     "unit" "public"."Unit",
ALTER COLUMN "currency" DROP NOT NULL;

-- DropEnum
DROP TYPE "public"."AccountUnit";
