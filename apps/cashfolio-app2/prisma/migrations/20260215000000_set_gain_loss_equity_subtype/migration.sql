-- Set equityAccountSubtype to GAIN_LOSS for all EQUITY account groups that don't have one yet
UPDATE "AccountGroup"
SET "equityAccountSubtype" = 'GAIN_LOSS'
WHERE "type" = 'EQUITY'
  AND "equityAccountSubtype" IS NULL
  AND "parentGroupId" IS NOT NULL;
