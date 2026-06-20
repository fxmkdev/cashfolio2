-- CreateEnum
CREATE TYPE "ValuationProviderName" AS ENUM ('CURRENCYLAYER', 'COINLAYER', 'MARKETSTACK');

-- CreateEnum
CREATE TYPE "ValuationProviderUnitType" AS ENUM ('CURRENCY', 'CRYPTOCURRENCY', 'SECURITY');

-- CreateEnum
CREATE TYPE "ValuationProviderRequestOutcome" AS ENUM ('RETRIEVED', 'NO_DATA', 'MISSING_RATE', 'TIMEOUT', 'HTTP_ERROR', 'PROVIDER_ERROR', 'REQUEST_ERROR', 'RATE_LIMIT_RETRY');

-- CreateEnum
CREATE TYPE "ValuationProviderRequestReason" AS ENUM ('INITIAL_PROBE', 'BACKTRACK_PROBE', 'RATE_LIMIT_RETRY');

-- CreateTable
CREATE TABLE "ValuationProviderRequest" (
    "id" TEXT NOT NULL,
    "provider" "ValuationProviderName" NOT NULL,
    "unitType" "ValuationProviderUnitType" NOT NULL,
    "outcome" "ValuationProviderRequestOutcome" NOT NULL,
    "requestReason" "ValuationProviderRequestReason" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT,
    "cryptocurrency" TEXT,
    "symbol" TEXT,
    "tradeCurrency" TEXT,
    "httpStatus" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "ValuationProviderRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValuationProviderRequest_requestedAt_idx" ON "ValuationProviderRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "ValuationProviderRequest_provider_requestedAt_idx" ON "ValuationProviderRequest"("provider", "requestedAt");

-- CreateIndex
CREATE INDEX "ValuationProviderRequest_outcome_requestedAt_idx" ON "ValuationProviderRequest"("outcome", "requestedAt");

-- CreateIndex
CREATE INDEX "ValuationProviderRequest_requestReason_requestedAt_idx" ON "ValuationProviderRequest"("requestReason", "requestedAt");
