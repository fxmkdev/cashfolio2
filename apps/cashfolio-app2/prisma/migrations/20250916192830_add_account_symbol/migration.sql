/*
  Warnings:

  - Made the column `unit` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "symbol" TEXT;

-- AlterTable
ALTER TABLE "public"."Booking" ALTER COLUMN "unit" SET NOT NULL;
