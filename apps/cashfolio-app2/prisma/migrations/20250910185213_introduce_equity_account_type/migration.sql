/*
  Warnings:

  - The values [INCOME,EXPENSE] on the enum `AccountType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `openingBalance` on the `Account` table. All the data in the column will be lost.
  - Made the column `currency` on table `Booking` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."AccountType_new" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY');
ALTER TABLE "public"."AccountGroup" ALTER COLUMN "type" TYPE "public"."AccountType_new" USING ("type"::text::"public"."AccountType_new");
ALTER TABLE "public"."Account" ALTER COLUMN "type" TYPE "public"."AccountType_new" USING ("type"::text::"public"."AccountType_new");
ALTER TYPE "public"."AccountType" RENAME TO "AccountType_old";
ALTER TYPE "public"."AccountType_new" RENAME TO "AccountType";
DROP TYPE "public"."AccountType_old";
COMMIT;

-- AlterTable
ALTER TABLE "public"."Account" DROP COLUMN "openingBalance";

-- AlterTable
ALTER TABLE "public"."Booking" ALTER COLUMN "currency" SET NOT NULL;
