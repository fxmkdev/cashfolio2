/*
  Warnings:

  - The primary key for the `Account` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `AccountGroup` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Booking` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Transaction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `accountBookId` to the `Account` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountBookId` to the `AccountGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountBookId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accountBookId` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Account" DROP CONSTRAINT "Account_groupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AccountGroup" DROP CONSTRAINT "AccountGroup_parentGroupId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_accountId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_transactionId_fkey";

-- AlterTable
ALTER TABLE "public"."Account" DROP CONSTRAINT "Account_pkey",
ADD COLUMN     "accountBookId" TEXT NOT NULL,
ADD CONSTRAINT "Account_pkey" PRIMARY KEY ("id", "accountBookId");

-- AlterTable
ALTER TABLE "public"."AccountGroup" DROP CONSTRAINT "AccountGroup_pkey",
ADD COLUMN     "accountBookId" TEXT NOT NULL,
ADD CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id", "accountBookId");

-- AlterTable
ALTER TABLE "public"."Booking" DROP CONSTRAINT "Booking_pkey",
ADD COLUMN     "accountBookId" TEXT NOT NULL,
ADD CONSTRAINT "Booking_pkey" PRIMARY KEY ("id", "accountBookId");

-- AlterTable
ALTER TABLE "public"."Transaction" DROP CONSTRAINT "Transaction_pkey",
ADD COLUMN     "accountBookId" TEXT NOT NULL,
ADD CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id", "accountBookId");

-- CreateTable
CREATE TABLE "public"."AccountBook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "AccountBook_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."AccountGroup" ADD CONSTRAINT "AccountGroup_parentGroupId_accountBookId_fkey" FOREIGN KEY ("parentGroupId", "accountBookId") REFERENCES "public"."AccountGroup"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccountGroup" ADD CONSTRAINT "AccountGroup_accountBookId_fkey" FOREIGN KEY ("accountBookId") REFERENCES "public"."AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_groupId_accountBookId_fkey" FOREIGN KEY ("groupId", "accountBookId") REFERENCES "public"."AccountGroup"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_accountBookId_fkey" FOREIGN KEY ("accountBookId") REFERENCES "public"."AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_accountBookId_fkey" FOREIGN KEY ("accountBookId") REFERENCES "public"."AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_transactionId_accountBookId_fkey" FOREIGN KEY ("transactionId", "accountBookId") REFERENCES "public"."Transaction"("id", "accountBookId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_accountId_accountBookId_fkey" FOREIGN KEY ("accountId", "accountBookId") REFERENCES "public"."Account"("id", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_accountBookId_fkey" FOREIGN KEY ("accountBookId") REFERENCES "public"."AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
