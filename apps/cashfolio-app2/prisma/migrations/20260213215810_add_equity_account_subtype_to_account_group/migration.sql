-- AlterTable
ALTER TABLE "AccountGroup" ADD COLUMN     "equityAccountSubtype" "EquityAccountSubtype";

-- Data migration: set equityAccountSubtype on EQUITY groups where all descendant accounts share the same subtype
UPDATE "AccountGroup" ag
SET "equityAccountSubtype" = sub.subtype
FROM (
    WITH RECURSIVE descendants AS (
        -- Start from each EQUITY group
        SELECT g."id" AS root_id, g."accountBookId" AS root_book_id,
               g."id", g."accountBookId"
        FROM "AccountGroup" g
        WHERE g."type" = 'EQUITY'

        UNION ALL

        -- Recurse into child groups
        SELECT d.root_id, d.root_book_id,
               cg."id", cg."accountBookId"
        FROM descendants d
        JOIN "AccountGroup" cg ON cg."parentGroupId" = d."id"
                               AND cg."accountBookId" = d."accountBookId"
    )
    SELECT d.root_id, d.root_book_id,
           MIN(a."equityAccountSubtype"::text)::"EquityAccountSubtype" AS subtype
    FROM descendants d
    JOIN "Account" a ON a."groupId" = d."id" AND a."accountBookId" = d."accountBookId"
    GROUP BY d.root_id, d.root_book_id
    HAVING COUNT(DISTINCT a."equityAccountSubtype") = 1
       AND COUNT(*) = COUNT(a."equityAccountSubtype")
) sub
WHERE ag."id" = sub.root_id
  AND ag."accountBookId" = sub.root_book_id;
