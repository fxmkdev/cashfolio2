CREATE TEMP TABLE "_income_expense_root_groups" AS
SELECT
  g."id",
  g."accountBookId"
FROM "public"."AccountGroup" g
WHERE g."type" = 'EQUITY'
  AND g."equityAccountSubtype" IN ('INCOME', 'EXPENSE')
  AND g."parentGroupId" IS NULL;

UPDATE "public"."Account" a
SET "groupId" = NULL
FROM "_income_expense_root_groups" target
WHERE a."groupId" = target."id"
  AND a."accountBookId" = target."accountBookId";

UPDATE "public"."AccountGroup" child
SET "parentGroupId" = NULL
FROM "_income_expense_root_groups" target
WHERE child."parentGroupId" = target."id"
  AND child."accountBookId" = target."accountBookId";

DELETE FROM "public"."AccountGroup" g
USING "_income_expense_root_groups" doomed
WHERE g."id" = doomed."id"
  AND g."accountBookId" = doomed."accountBookId";

DROP TABLE "_income_expense_root_groups";
