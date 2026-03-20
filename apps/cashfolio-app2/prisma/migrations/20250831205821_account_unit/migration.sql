/*
  Warnings:

  - Added the required column `unit` to the `Account` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."AccountUnit" AS ENUM ('CURRENCY', 'STOCK');

-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "currency" TEXT,
ADD COLUMN     "unit" "public"."AccountUnit" NOT NULL;
