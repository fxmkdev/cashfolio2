CREATE TEMP TABLE "_income_expense_root_groups" AS
WITH ranked_root_groups AS (
  SELECT
    g."id",
    g."accountBookId",
    g."equityAccountSubtype",
    row_number() OVER (
      PARTITION BY g."accountBookId", g."equityAccountSubtype"
      ORDER BY g."createdAt" ASC, g."id" ASC
    ) AS "rowNumber"
  FROM "public"."AccountGroup" g
  WHERE g."type" = 'EQUITY'
    AND g."equityAccountSubtype" IN ('INCOME', 'EXPENSE')
    AND g."parentGroupId" IS NULL
)
SELECT
  g."id",
  g."accountBookId"
FROM ranked_root_groups g
WHERE g."rowNumber" = 1
  AND (
    EXISTS (
      SELECT 1
      FROM "public"."Account" a
      WHERE a."groupId" = g."id"
        AND a."accountBookId" = g."accountBookId"
    )
    OR EXISTS (
      SELECT 1
      FROM "public"."AccountGroup" child
      WHERE child."parentGroupId" = g."id"
        AND child."accountBookId" = g."accountBookId"
    )
  );

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
