/*
  Warnings:

  - You are about to drop the column `slug` on the `Account` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `AccountGroup` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."Account_slug_key";

-- DropIndex
DROP INDEX "public"."AccountGroup_slug_key";

-- AlterTable
ALTER TABLE "public"."Account" DROP COLUMN "slug";

-- AlterTable
ALTER TABLE "public"."AccountGroup" DROP COLUMN "slug";
