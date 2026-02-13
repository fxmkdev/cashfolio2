-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('ADMIN');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "roles" "public"."UserRole"[] DEFAULT ARRAY[]::"public"."UserRole"[];
