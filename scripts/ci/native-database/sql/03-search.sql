-- LOCAL ONLY additive candidate. Does not replace search_food_catalog_v2 or any guard.
-- One MVCC statement snapshot binds the food tuple to private confirmed protection.
BEGIN;
-- Fail closed before any definition is created. The privileged owner is explicit,
-- not whichever role happened to run this script. No role grants are added here.
DO $preflight$
BEGIN
 IF current_user <> 'postgres' OR NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='postgres' AND (rolsuper OR rolbypassrls)
 ) THEN RAISE EXCEPTION 'search_snapshot_requires_trusted_postgres_owner' USING ERRCODE='42501'; END IF;
 IF NOT pg_catalog.has_table_privilege('postgres','public.food_items','SELECT') OR
    NOT pg_catalog.has_table_privilege('postgres','macrogoal_food_private.nutrition_current','SELECT') OR
    NOT pg_catalog.has_schema_privilege('service_role','macrogoal_food_private','USAGE') THEN
  RAISE EXCEPTION 'search_snapshot_owner_or_schema_preflight_failed' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.pg_has_role('anon','postgres','MEMBER') OR
    pg_catalog.pg_has_role('authenticated','postgres','MEMBER') OR
    pg_catalog.pg_has_role('service_role','postgres','MEMBER') THEN
  RAISE EXCEPTION 'search_snapshot_owner_is_application_accessible' USING ERRCODE='42501';
 END IF;
END $preflight$;
CREATE FUNCTION macrogoal_food_private.read_search_snapshots_v1(p_food_ids uuid[])
RETURNS TABLE(id uuid, snapshot jsonb, protected boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'service_only' USING ERRCODE='42501';
 END IF;
 IF p_food_ids IS NULL OR coalesce(array_ndims(p_food_ids), 1) <> 1 OR
    cardinality(p_food_ids) > 100 OR array_position(p_food_ids, NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_food_ids' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT f.id, jsonb_build_object(
  'id', f.id,
  'barcode', f.barcode,
  'name', f.name,
  'product_name', f.product_name,
  'generic_name', f.generic_name,
  'brand', f.brand,
  'brands', f.brands,
  'source', f.source,
  'usda_fdc_id', f.usda_fdc_id,
  'calories', f.calories,
  'protein', f.protein,
  'carbs', f.carbs,
  'fat', f.fat,
  'fiber', f.fiber,
  'macros_per', f.macros_per,
  'serving_size', f.serving_size,
  'serving_unit', f.serving_unit,
  'serving_quantity', f.serving_quantity,
  'serving_description', f.serving_description,
  'serving_count', f.serving_count,
  'nutriments', f.nutriments,
  'nutriscore_grade', f.nutriscore_grade,
  'popularity_score', f.popularity_score,
  'search_count', f.search_count,
  'logs_last_30d', f.logs_last_30d,
  'data_quality_score', f.data_quality_score
 ), (coalesce(n.confirmed, false) OR coalesce(f.verified, false) OR
     coalesce(f.ai_verified, false) OR coalesce(f.ai_verified_source, '') LIKE 'barcode_recovery:%')
 FROM public.food_items f
 LEFT JOIN macrogoal_food_private.nutrition_current n ON n.food_id=f.id
 WHERE f.id=ANY(p_food_ids)
 ORDER BY array_position(p_food_ids, f.id);
END $$;
CREATE FUNCTION public.read_food_search_snapshots_v1(p_food_ids uuid[])
RETURNS TABLE(id uuid, snapshot jsonb, protected boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM macrogoal_food_private.read_search_snapshots_v1(p_food_ids);
END $$;
ALTER FUNCTION macrogoal_food_private.read_search_snapshots_v1(uuid[]) OWNER TO postgres;
ALTER FUNCTION public.read_food_search_snapshots_v1(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION macrogoal_food_private.read_search_snapshots_v1(uuid[]),
 public.read_food_search_snapshots_v1(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION macrogoal_food_private.read_search_snapshots_v1(uuid[]),
 public.read_food_search_snapshots_v1(uuid[]) TO service_role;
COMMIT;
