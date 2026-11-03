-- REVIEW CANDIDATE ONLY. No execution without exact catalog-metadata approval.
-- Existing food_items only; no schema/index/grant/RLS or nutrition changes.
-- Evidence checked 2026-11-03:
-- USDA FDC 173263, SR Legacy: description contains the historic brand label;
-- API has no brand/manufacturer field and only generic FoodOn/category attributes.
-- https://api.nal.usda.gov/fdc/v1/food/173263 (public DEMO_KEY lookup)
-- Independent manufacturer evidence identifies Uncle Ben's as a brand:
-- https://www.mars.com/en-au/news-and-stories/press-releases-statements/mars-food-announces-the-uncle-bensr-brand-will-change-its-name-bens
-- Preserve historic label; do NOT relabel nutrition as a current Ben's Original product.
-- This is evidence-reviewed record metadata, NOT a food/brand conditional in ranking.
-- General process: preserve explicit provider brand fields on import; for missing
-- fields require record-specific authoritative evidence and a reviewed manifest.
-- Unknown/ambiguous records stay unknown. Case/title/capitalization is not evidence.
-- This one verified row does not certify the rest of the catalog.
-- Existing common ranking already consumes brand; no Edge/RPC change is needed.
-- After approved application, test generic cooked rice and explicit brand queries
-- through RPC + existing app. Capture the resulting updated_at for guarded rollback.
-- Rollback proposal: restore the prior NULL brand only if identity, current brand
-- and captured updated_at still match; never overwrite subsequent catalog edits.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5s';
DO $metadata$
DECLARE
  target_id uuid;
  before_row jsonb;
  after_row jsonb;
  changed integer;
BEGIN
  SELECT f.id,to_jsonb(f) INTO STRICT target_id,before_row
  FROM public.food_items f
  WHERE f.source='usda' AND f.usda_fdc_id='173263'
    AND f.name='Rice, brown, parboiled, cooked, UNCLE BENS'
    AND nullif(btrim(f.brand),'') IS NULL
    AND nullif(btrim(f.brands),'') IS NULL
  FOR UPDATE;

  UPDATE public.food_items AS f SET brand='Uncle Ben''s'
  WHERE f.id=target_id
  RETURNING to_jsonb(f) INTO after_row;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'Catalog identity drift'; END IF;
  IF (after_row->>'brand') IS DISTINCT FROM 'Uncle Ben''s' THEN
    RAISE EXCEPTION 'Unexpected brand value; update rolled back';
  END IF;
  IF (after_row - ARRAY['brand','updated_at']) IS DISTINCT FROM
     (before_row - ARRAY['brand','updated_at']) THEN
    RAISE EXCEPTION 'Unexpected non-brand change; entire update rolled back';
  END IF;
END;
$metadata$;
COMMIT;
