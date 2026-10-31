-- Extend the existing staging-only role's application-table access. Never create
-- the role here: production must continue to have no staging seed identity.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cashfolio_staging_seed') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "ClassificationScheme", "ClassificationNode", "AccountClassification"
    TO cashfolio_staging_seed;
    GRANT EXECUTE ON FUNCTION public.initialize_book_classifications(),
      public.seed_asset_class_scheme(text)
    TO cashfolio_staging_seed;
  END IF;
END; $$;
