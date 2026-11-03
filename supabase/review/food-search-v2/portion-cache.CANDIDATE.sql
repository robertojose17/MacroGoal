-- CANDIDATE ONLY. Review and explicit database activation approval required.
-- Same existing Supabase database; no catalog copy, user identifiers or nutrient writes.
-- Provider detail must be fetched server-side using exact FDC ID, never client JSON.
-- Existing food_items permissions/policies remain unchanged.
BEGIN;
CREATE SCHEMA IF NOT EXISTS macrogoal_food_private;
REVOKE ALL ON SCHEMA macrogoal_food_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA macrogoal_food_private TO service_role;
CREATE TABLE macrogoal_food_private.usda_portions (
  fdc_id text PRIMARY KEY CHECK (fdc_id ~ '^[0-9]{1,20}$'),
  payload jsonb NOT NULL CHECK (COALESCE((
    jsonb_typeof(payload) = 'object'
    AND payload->>'provider' = 'usda'
    AND payload->>'version' = '1'
    AND payload->>'fdcId' = fdc_id
    AND jsonb_typeof(payload->'portions') = 'array'
    AND jsonb_array_length(payload->'portions') BETWEEN 1 AND 64
  ), false)),
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE macrogoal_food_private.usda_portions ENABLE ROW LEVEL SECURITY;
ALTER TABLE macrogoal_food_private.usda_portions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON macrogoal_food_private.usda_portions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON macrogoal_food_private.usda_portions TO service_role;
COMMIT;
-- No public RPC/read endpoint, no client writes, no service secret sent to app.
-- Edge handler supplies only normalized portions to existing search/lookup responses.
-- Confirm actual service_role BYPASSRLS and function ownership before activation.
-- Server retains FDC description/preparation and retrieval timestamp in payload.
-- Never fill from name-search's first match or legacy heuristic serving fields.
-- Read-through on exact-food detail/scan; search uses cache only, never N detail calls.
-- Provider timeout/failure/multiple ambiguous measures => 100g, not fabricated defaults.
-- Rollback: disconnect readers/writers first; retain cache until recovery is approved.
