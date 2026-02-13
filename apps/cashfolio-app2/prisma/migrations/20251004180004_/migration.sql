/*
  Warnings:

  - You are about to drop the `_AccountBookToUser` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."_AccountBookToUser" DROP CONSTRAINT "_AccountBookToUser_A_fkey";

-- DropForeignKey
ALTER TABLE "public"."_AccountBookToUser" DROP CONSTRAINT "_AccountBookToUser_B_fkey";

-- DropTable
DROP TABLE "public"."_AccountBookToUser";

-- CreateTable
CREATE TABLE "public"."UserAccountBookLink" (
    "userId" TEXT NOT NULL,
    "accountBookId" TEXT NOT NULL,

    CONSTRAINT "UserAccountBookLink_pkey" PRIMARY KEY ("userId","accountBookId")
);

-- AddForeignKey
ALTER TABLE "public"."UserAccountBookLink" ADD CONSTRAINT "UserAccountBookLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserAccountBookLink" ADD CONSTRAINT "UserAccountBookLink_accountBookId_fkey" FOREIGN KEY ("accountBookId") REFERENCES "public"."AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
