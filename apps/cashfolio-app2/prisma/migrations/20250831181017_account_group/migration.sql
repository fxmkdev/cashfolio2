/*
  Warnings:

  - Added the required column `groupId` to the `Account` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."AccountType" AS ENUM ('ASSET', 'LIABILITY');

-- AlterTable
ALTER TABLE "public"."Account" ADD COLUMN     "groupId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."AccountGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "public"."AccountType" NOT NULL,
    "parentGroupId" TEXT,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountGroup_slug_key" ON "public"."AccountGroup"("slug");

-- AddForeignKey
ALTER TABLE "public"."AccountGroup" ADD CONSTRAINT "AccountGroup_parentGroupId_fkey" FOREIGN KEY ("parentGroupId") REFERENCES "public"."AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."AccountGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
