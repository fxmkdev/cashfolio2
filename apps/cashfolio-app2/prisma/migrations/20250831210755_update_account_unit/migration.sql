/*
  Warnings:

  - The values [STOCK] on the enum `AccountUnit` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."AccountUnit_new" AS ENUM ('CURRENCY', 'SECURITY');
ALTER TABLE "public"."Account" ALTER COLUMN "unit" TYPE "public"."AccountUnit_new" USING ("unit"::text::"public"."AccountUnit_new");
ALTER TYPE "public"."AccountUnit" RENAME TO "AccountUnit_old";
ALTER TYPE "public"."AccountUnit_new" RENAME TO "AccountUnit";
DROP TYPE "public"."AccountUnit_old";
COMMIT;
