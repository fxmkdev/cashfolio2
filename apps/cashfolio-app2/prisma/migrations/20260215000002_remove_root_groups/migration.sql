-- Step 1: Make groupId nullable
ALTER TABLE "Account" ALTER COLUMN "groupId" DROP NOT NULL;

-- Step 2: Capture root group IDs before any mutations
CREATE TEMP TABLE "_root_groups" AS
  SELECT "id" FROM "AccountGroup" WHERE "parentGroupId" IS NULL;

-- Step 3: Nullify groupId on accounts whose group is a root group
UPDATE "Account"
SET "groupId" = NULL
WHERE "groupId" IN (SELECT "id" FROM "_root_groups");

-- Step 4: Nullify parentGroupId on groups whose parent is a root group
UPDATE "AccountGroup"
SET "parentGroupId" = NULL
WHERE "parentGroupId" IN (SELECT "id" FROM "_root_groups");

-- Step 5: Delete root groups
DELETE FROM "AccountGroup"
WHERE "id" IN (SELECT "id" FROM "_root_groups");

-- Step 6: Clean up
DROP TABLE "_root_groups";
