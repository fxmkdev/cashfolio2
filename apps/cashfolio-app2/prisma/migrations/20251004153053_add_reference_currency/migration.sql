/*
  Warnings:

  - Added the required column `referenceCurrency` to the `AccountBook` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AccountBook" ADD COLUMN     "referenceCurrency" TEXT NOT NULL;
