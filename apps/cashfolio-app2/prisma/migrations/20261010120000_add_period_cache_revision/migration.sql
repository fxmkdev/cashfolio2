-- Cache validity commits atomically with financial data, independently of Redis.
ALTER TABLE "public"."AccountBook"
ADD COLUMN "periodCacheRevision" UUID NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION "public"."advance_period_cache_revision_for_rows"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  book_id TEXT;
BEGIN
  -- Transition tables avoid one AccountBook update per booking in bulk writes.
  -- Lock books in a stable order when one statement touches multiple books.
  FOR book_id IN
    SELECT DISTINCT "accountBookId" FROM changed_rows ORDER BY "accountBookId"
  LOOP
    UPDATE "public"."AccountBook"
    SET "periodCacheRevision" = gen_random_uuid()
    WHERE "id" = book_id;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE FUNCTION "public"."advance_period_cache_revision_for_updated_rows"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  book_id TEXT;
BEGIN
  -- Invalidate both books if rows are reassigned by an administrative writer.
  FOR book_id IN
    SELECT "accountBookId" FROM changed_rows
    UNION
    SELECT "accountBookId" FROM previous_rows
    ORDER BY "accountBookId"
  LOOP
    UPDATE "public"."AccountBook"
    SET "periodCacheRevision" = gen_random_uuid()
    WHERE "id" = book_id;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Account', 'AccountGroup', 'Transaction', 'Booking']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT ON "public".%I
       REFERENCING NEW TABLE AS changed_rows FOR EACH STATEMENT
       EXECUTE FUNCTION "public"."advance_period_cache_revision_for_rows"()',
      table_name || '_period_cache_insert', table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER DELETE ON "public".%I
       REFERENCING OLD TABLE AS changed_rows FOR EACH STATEMENT
       EXECUTE FUNCTION "public"."advance_period_cache_revision_for_rows"()',
      table_name || '_period_cache_delete', table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I AFTER UPDATE ON "public".%I
       REFERENCING NEW TABLE AS changed_rows OLD TABLE AS previous_rows
       FOR EACH STATEMENT
       EXECUTE FUNCTION "public"."advance_period_cache_revision_for_updated_rows"()',
      table_name || '_period_cache_update', table_name
    );
  END LOOP;
END;
$$;

CREATE FUNCTION "public"."advance_period_cache_revision_for_settings"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."referenceCurrency" IS DISTINCT FROM OLD."referenceCurrency"
    OR NEW."startDate" IS DISTINCT FROM OLD."startDate" THEN
    NEW."periodCacheRevision" := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AccountBook_period_cache_settings"
BEFORE UPDATE ON "public"."AccountBook"
FOR EACH ROW
EXECUTE FUNCTION "public"."advance_period_cache_revision_for_settings"();
