CREATE TYPE "AssetClass" AS ENUM (
  'CASH_AND_CASH_EQUIVALENTS',
  'EQUITIES',
  'FIXED_INCOME',
  'REAL_ESTATE',
  'COMMODITIES_AND_PRECIOUS_METALS',
  'DIGITAL_ASSETS',
  'ALTERNATIVE_INVESTMENTS',
  'OTHER_ASSETS'
);

-- NULL means Unclassified. Existing accounts are deliberately not backfilled.
ALTER TABLE "Account" ADD COLUMN "assetClass" "AssetClass";

ALTER TABLE "Account" ADD CONSTRAINT "Account_assetClass_account_type_check"
  CHECK ("assetClass" IS NULL OR "type" IN ('ASSET', 'LIABILITY'));
