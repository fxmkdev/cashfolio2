CREATE TYPE "AccountTrackingMethod" AS ENUM ('INDIVIDUAL_UNITS', 'TOTAL_PORTFOLIO_VALUE');

-- Preserve existing reporting behavior; portfolio tracking is explicitly selected.
ALTER TABLE "Account" ADD COLUMN "trackingMethod" "AccountTrackingMethod" NOT NULL DEFAULT 'INDIVIDUAL_UNITS';

ALTER TABLE "Account" ADD CONSTRAINT "Account_trackingMethod_currency_balance_check"
  CHECK ("trackingMethod" = 'INDIVIDUAL_UNITS' OR ("type" = 'BALANCE' AND "unit" IS NOT DISTINCT FROM 'CURRENCY'));
