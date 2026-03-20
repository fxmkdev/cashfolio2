-- Equity accounts should never have unit-specific metadata.
UPDATE "Account"
SET
  "unit" = NULL,
  "currency" = NULL,
  "cryptocurrency" = NULL,
  "symbol" = NULL,
  "tradeCurrency" = NULL
WHERE "type" = 'EQUITY'
  AND (
    "unit" IS NOT NULL
    OR "currency" IS NOT NULL
    OR "cryptocurrency" IS NOT NULL
    OR "symbol" IS NOT NULL
    OR "tradeCurrency" IS NOT NULL
  );
