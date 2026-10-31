CREATE TABLE "ClassificationScheme" (
  "id" TEXT NOT NULL, "accountBookId" TEXT NOT NULL, "name" TEXT NOT NULL,
  PRIMARY KEY ("id", "accountBookId"),
  FOREIGN KEY ("accountBookId") REFERENCES "AccountBook"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ClassificationNode" (
  "id" TEXT NOT NULL, "schemeId" TEXT NOT NULL, "accountBookId" TEXT NOT NULL,
  "name" TEXT NOT NULL CHECK (length(btrim("name")) > 0), "parentId" TEXT, "sortOrder" INTEGER NOT NULL,
  PRIMARY KEY ("id", "schemeId", "accountBookId"),
  FOREIGN KEY ("schemeId", "accountBookId") REFERENCES "ClassificationScheme"("id", "accountBookId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("parentId", "schemeId", "accountBookId") REFERENCES "ClassificationNode"("id", "schemeId", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("parentId" IS DISTINCT FROM "id")
);
CREATE INDEX "ClassificationNode_accountBookId_schemeId_parentId_sortOrder_idx" ON "ClassificationNode"("accountBookId", "schemeId", "parentId", "sortOrder");
CREATE UNIQUE INDEX "ClassificationNode_sibling_name_key" ON "ClassificationNode" ("accountBookId", "schemeId", COALESCE("parentId", ''), lower(btrim("name")));
CREATE TABLE "AccountClassification" (
  "accountId" TEXT NOT NULL, "schemeId" TEXT NOT NULL, "accountBookId" TEXT NOT NULL, "nodeId" TEXT NOT NULL,
  PRIMARY KEY ("accountId", "schemeId", "accountBookId"),
  FOREIGN KEY ("accountId", "accountBookId") REFERENCES "Account"("id", "accountBookId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("nodeId", "schemeId", "accountBookId") REFERENCES "ClassificationNode"("id", "schemeId", "accountBookId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AccountClassification_nodeId_schemeId_accountBookId_idx" ON "AccountClassification"("nodeId", "schemeId", "accountBookId");

-- Database initialization covers all book creation paths, including seeds and tooling.
CREATE FUNCTION "seed_asset_class_scheme"(book_id TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "ClassificationScheme" ("id", "accountBookId", "name") VALUES ('assetClass', book_id, 'Asset Class');
  INSERT INTO "ClassificationNode" ("id", "schemeId", "accountBookId", "name", "parentId", "sortOrder")
  SELECT id, 'assetClass', book_id, name, NULL, sort_order FROM (VALUES
    ('CASH_AND_CASH_EQUIVALENTS', 'Cash & Cash Equivalents', 0),
    ('EQUITIES', 'Equities', 1), ('FIXED_INCOME', 'Fixed Income', 2),
    ('REAL_ESTATE', 'Real Estate', 3), ('COMMODITIES_AND_PRECIOUS_METALS', 'Commodities & Precious Metals', 4),
    ('DIGITAL_ASSETS', 'Digital Assets', 5), ('ALTERNATIVE_INVESTMENTS', 'Alternative Investments', 6),
    ('OTHER_ASSETS', 'Other Assets', 7)
  ) AS defaults(id, name, sort_order);
END;
$$;
SELECT "seed_asset_class_scheme"("id") FROM "AccountBook";
INSERT INTO "AccountClassification" ("accountId", "schemeId", "accountBookId", "nodeId")
SELECT "id", 'assetClass', "accountBookId", "assetClass"::text FROM "Account" WHERE "assetClass" IS NOT NULL;
CREATE FUNCTION "initialize_book_classifications"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM "seed_asset_class_scheme"(NEW."id"); RETURN NEW; END;
$$;
CREATE TRIGGER "AccountBook_initialize_classifications" AFTER INSERT ON "AccountBook" FOR EACH ROW EXECUTE FUNCTION "initialize_book_classifications"();
ALTER TABLE "Account" DROP COLUMN "assetClass";
DROP TYPE "AssetClass";

CREATE FUNCTION "validate_classification_account"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Account" WHERE "id"=NEW."accountId" AND "accountBookId"=NEW."accountBookId" AND "type"='BALANCE') THEN
    RAISE EXCEPTION 'Classification is only allowed for balance accounts' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "AccountClassification_balance_only" BEFORE INSERT OR UPDATE ON "AccountClassification" FOR EACH ROW EXECUTE FUNCTION "validate_classification_account"();
CREATE FUNCTION "validate_classified_account_type"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" <> 'BALANCE' AND EXISTS (SELECT 1 FROM "AccountClassification" WHERE "accountId"=OLD."id" AND "accountBookId"=OLD."accountBookId") THEN
    RAISE EXCEPTION 'Classification is only allowed for balance accounts' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Account_classification_type" BEFORE UPDATE OF "type" ON "Account" FOR EACH ROW EXECUTE FUNCTION "validate_classified_account_type"();

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['ClassificationScheme', 'ClassificationNode', 'AccountClassification'] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON %I REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "advance_period_cache_revision_for_rows"()', table_name || '_period_cache_insert', table_name);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT EXECUTE FUNCTION "advance_period_cache_revision_for_rows"()', table_name || '_period_cache_delete', table_name);
    EXECUTE format('CREATE TRIGGER %I AFTER UPDATE ON %I REFERENCING NEW TABLE AS changed_rows OLD TABLE AS previous_rows FOR EACH STATEMENT EXECUTE FUNCTION "advance_period_cache_revision_for_updated_rows"()', table_name || '_period_cache_update', table_name);
  END LOOP;
END; $$;
UPDATE "AccountBook" SET "periodCacheRevision"=gen_random_uuid();
