-- AlterTable
ALTER TABLE "public"."AccountGroup" ALTER COLUMN "sortOrder" DROP NOT NULL,
ALTER COLUMN "sortOrder" DROP DEFAULT;
