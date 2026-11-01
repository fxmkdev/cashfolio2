-- Only future books receive these defaults. Do not seed or rewrite existing books.
-- Replacing the function preserves its trigger and previously granted privileges.
CREATE OR REPLACE FUNCTION "seed_asset_class_scheme"(book_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "ClassificationScheme" ("id", "accountBookId", "name") VALUES ('assetClass', book_id, 'Asset Class');
  INSERT INTO "ClassificationNode" ("id", "schemeId", "accountBookId", "name", "parentId", "sortOrder")
  SELECT id, 'assetClass', book_id, name, NULL, sort_order FROM (VALUES
    ('CASH_AND_CASH_EQUIVALENTS', 'Cash & Cash Equivalents', 0),
    ('EQUITIES', 'Equities', 1),
    ('FIXED_INCOME', 'Fixed Income', 2),
    ('REAL_ESTATE', 'Real Estate', 3),
    ('COMMODITIES_AND_PRECIOUS_METALS', 'Commodities & Precious Metals', 4),
    ('DIGITAL_ASSETS', 'Digital Assets', 5),
    ('ALTERNATIVE_INVESTMENTS', 'Alternative Investments', 6),
    ('MULTI_ASSET_INVESTMENTS', 'Multi-Asset Investments', 7),
    ('OTHER_ASSETS', 'Other Assets', 8)
  ) AS defaults(id, name, sort_order);
  INSERT INTO "ClassificationNode" ("id", "schemeId", "accountBookId", "name", "parentId", "sortOrder")
  SELECT id, 'assetClass', book_id, name, parent_id, sort_order FROM (VALUES
    ('BANK_DEPOSITS', 'Bank Deposits', 'CASH_AND_CASH_EQUIVALENTS', 0),
    ('PHYSICAL_CASH', 'Physical Cash', 'CASH_AND_CASH_EQUIVALENTS', 1),
    ('MONEY_MARKET_INVESTMENTS', 'Money Market Investments', 'CASH_AND_CASH_EQUIVALENTS', 2),
    ('LISTED_EQUITIES', 'Listed Equities', 'EQUITIES', 0),
    ('PRIVATE_EQUITY', 'Private Equity', 'EQUITIES', 1),
    ('GOVERNMENT_BONDS', 'Government Bonds', 'FIXED_INCOME', 0),
    ('CORPORATE_BONDS', 'Corporate Bonds', 'FIXED_INCOME', 1),
    ('DIRECT_PROPERTY', 'Direct Property', 'REAL_ESTATE', 0),
    ('REAL_ESTATE_FUNDS', 'Real Estate Funds', 'REAL_ESTATE', 1),
    ('PRECIOUS_METALS', 'Precious Metals', 'COMMODITIES_AND_PRECIOUS_METALS', 0),
    ('OTHER_COMMODITIES', 'Other Commodities', 'COMMODITIES_AND_PRECIOUS_METALS', 1),
    ('CRYPTOCURRENCIES', 'Cryptocurrencies', 'DIGITAL_ASSETS', 0),
    ('OTHER_DIGITAL_ASSETS', 'Other Digital Assets', 'DIGITAL_ASSETS', 1),
    ('HEDGE_FUNDS', 'Hedge Funds', 'ALTERNATIVE_INVESTMENTS', 0),
    ('STRUCTURED_PRODUCTS', 'Structured Products', 'ALTERNATIVE_INVESTMENTS', 1)
  ) AS defaults(id, name, parent_id, sort_order);
END;
$$;
