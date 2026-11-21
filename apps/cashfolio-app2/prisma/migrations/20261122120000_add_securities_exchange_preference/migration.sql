-- Nullable default preserves existing users and catalogue data.
ALTER TABLE "User" ADD COLUMN "securitiesExchangeMic" TEXT;
