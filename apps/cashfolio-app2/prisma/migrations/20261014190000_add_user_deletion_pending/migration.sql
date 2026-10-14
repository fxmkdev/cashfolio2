ALTER TABLE "public"."User"
ADD COLUMN "deletionPending" BOOLEAN NOT NULL DEFAULT false;
