-- For each account book, create three new EQUITY root groups (one per subtype)
-- and re-parent the children of the old EQUITY root group accordingly.

-- 1. Create new root groups for each subtype per account book
INSERT INTO "AccountGroup" ("id", "name", "type", "equityAccountSubtype", "parentGroupId", "accountBookId", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  CASE subtype
    WHEN 'INCOME' THEN 'Income'
    WHEN 'EXPENSE' THEN 'Expenses'
    WHEN 'GAIN_LOSS' THEN 'Gain/Loss'
  END,
  'EQUITY',
  subtype::"EquityAccountSubtype",
  NULL,
  ab."id",
  true,
  NOW(),
  NOW()
FROM "AccountBook" ab
CROSS JOIN (VALUES ('INCOME'), ('EXPENSE'), ('GAIN_LOSS')) AS s(subtype);

-- 2. Re-parent child groups: move them from the old EQUITY root to the matching new root
UPDATE "AccountGroup" child
SET "parentGroupId" = new_root."id"
FROM "AccountGroup" old_root
JOIN "AccountGroup" new_root
  ON new_root."accountBookId" = old_root."accountBookId"
  AND new_root."type" = 'EQUITY'
  AND new_root."parentGroupId" IS NULL
  AND new_root."equityAccountSubtype" IS NOT NULL
WHERE old_root."type" = 'EQUITY'
  AND old_root."parentGroupId" IS NULL
  AND old_root."equityAccountSubtype" IS NULL
  AND child."parentGroupId" = old_root."id"
  AND child."accountBookId" = old_root."accountBookId"
  AND child."equityAccountSubtype" = new_root."equityAccountSubtype";

-- 3. Re-parent accounts that are directly under the old EQUITY root to the matching new root
UPDATE "Account" acc
SET "groupId" = new_root."id"
FROM "AccountGroup" old_root
JOIN "AccountGroup" new_root
  ON new_root."accountBookId" = old_root."accountBookId"
  AND new_root."type" = 'EQUITY'
  AND new_root."parentGroupId" IS NULL
  AND new_root."equityAccountSubtype" IS NOT NULL
WHERE old_root."type" = 'EQUITY'
  AND old_root."parentGroupId" IS NULL
  AND old_root."equityAccountSubtype" IS NULL
  AND acc."groupId" = old_root."id"
  AND acc."accountBookId" = old_root."accountBookId"
  AND acc."equityAccountSubtype" = new_root."equityAccountSubtype";

-- 4. Delete the old EQUITY root groups (those without equityAccountSubtype)
DELETE FROM "AccountGroup"
WHERE "type" = 'EQUITY'
  AND "parentGroupId" IS NULL
  AND "equityAccountSubtype" IS NULL;
