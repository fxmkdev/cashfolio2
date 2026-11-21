ALTER TYPE "ValuationProviderRequestReason" ADD VALUE 'CATALOGUE_REFRESH';
ALTER TYPE "ValuationProviderRequestReason" ADD VALUE 'SECURITY_HISTORY';
CREATE TABLE "SecurityCatalogueSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rowCount" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "SecurityCatalogueListing" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "snapshotId" TEXT NOT NULL REFERENCES "SecurityCatalogueSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "symbol" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "exchange" TEXT,
  "mic" TEXT NOT NULL DEFAULT '',
  "exchangeLabel" TEXT NOT NULL,
  "country" TEXT,
  "hasHistory" BOOLEAN
);
CREATE INDEX "SecurityCatalogueSnapshot_publishedAt_idx" ON "SecurityCatalogueSnapshot"("publishedAt");
CREATE INDEX "SecurityCatalogueSnapshot_expiresAt_idx" ON "SecurityCatalogueSnapshot"("expiresAt");
CREATE UNIQUE INDEX "SecurityCatalogueListing_snapshotId_symbol_mic_key" ON "SecurityCatalogueListing"("snapshotId", "symbol", "mic");
CREATE INDEX "SecurityCatalogueListing_snapshotId_name_idx" ON "SecurityCatalogueListing"("snapshotId", "name");
CREATE INDEX "SecurityCatalogueListing_snapshotId_symbol_idx" ON "SecurityCatalogueListing"("snapshotId", "symbol");
CREATE INDEX "SecurityCatalogueListing_snapshotId_country_idx" ON "SecurityCatalogueListing"("snapshotId", "country");
CREATE INDEX "SecurityCatalogueListing_snapshotId_exchangeLabel_idx" ON "SecurityCatalogueListing"("snapshotId", "exchangeLabel");
CREATE INDEX "SecurityCatalogueListing_snapshotId_mic_idx" ON "SecurityCatalogueListing"("snapshotId", "mic");
