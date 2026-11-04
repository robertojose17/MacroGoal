-- REVIEW ONLY: not applied. Requires explicit index/schema approval.
-- Reuses food_items; no new catalog, data rewrite, grants, RLS or extension.
-- Existing indexes do not cover generic_name / brands alternate-field retrieval.
-- Companion RPC expression/predicate must match this definition exactly.
-- Ordinary CREATE INDEX blocks writes while building; lock wait and build are bounded.
-- If either timeout fires, transaction aborts; inspect outcome before any retry.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE INDEX food_items_alternate_fts_idx ON public.food_items
USING gin ((to_tsvector('simple'::regconfig,coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(product_name,'') || ' ' || coalesce(generic_name,'') || ' ' || coalesce(brands,''))))
WHERE (nullif(btrim(generic_name),'') IS NOT NULL
      OR (nullif(btrim(product_name),'') IS NOT NULL AND product_name IS DISTINCT FROM name)
      OR (nullif(btrim(brands),'') IS NOT NULL AND brands IS DISTINCT FROM brand));
COMMIT;
-- Proposed postflight: pg_index.indisvalid/indisready, pg_get_indexdef;
-- EXPLAIN (ANALYZE, BUFFERS) companion SELECT and verify this index is used.
-- No performance guarantee until the actual index is approved, applied and measured.
