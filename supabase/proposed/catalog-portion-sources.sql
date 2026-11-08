-- Proposed additive read-only RPC. Not applied. No provider requests or mutations.
CREATE OR REPLACE FUNCTION public.read_catalog_portion_sources_v1(p_food_ids uuid[])
RETURNS TABLE(id uuid,snapshot jsonb,protected boolean,food_revision integer,portion_source jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $function$
BEGIN
 IF current_user <> 'service_role' THEN RAISE EXCEPTION 'service_only' USING ERRCODE='42501'; END IF;
 IF p_food_ids IS NULL OR coalesce(array_ndims(p_food_ids),1)<>1 OR cardinality(p_food_ids)>100 OR array_position(p_food_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'invalid_food_ids' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 WITH foods AS MATERIALIZED (
 SELECT f.*,coalesce(n.revision,0) AS current_revision,
  (coalesce(n.confirmed,false) OR coalesce(f.verified,false) OR coalesce(f.ai_verified,false) OR coalesce(f.ai_verified_source,'') LIKE 'barcode_recovery:%') AS is_protected
 FROM public.food_items f LEFT JOIN macrogoal_food_private.nutrition_current n ON n.food_id=f.id
 WHERE f.id=ANY(p_food_ids)
 )
 SELECT f.id,jsonb_build_object(
  'id',f.id,'barcode',f.barcode,'name',f.name,'product_name',f.product_name,'generic_name',f.generic_name,
  'brand',f.brand,'brands',f.brands,'source',f.source,'usda_fdc_id',f.usda_fdc_id,
  'calories',f.calories,'protein',f.protein,'carbs',f.carbs,'fat',f.fat,'fiber',f.fiber,'macros_per',f.macros_per,
  'serving_size',f.serving_size,'serving_unit',f.serving_unit,'serving_quantity',f.serving_quantity,
  'serving_description',f.serving_description,'serving_count',f.serving_count,'nutriments',f.nutriments,
  'nutriscore_grade',f.nutriscore_grade,'popularity_score',f.popularity_score,'search_count',f.search_count,
  'logs_last_30d',f.logs_last_30d,'data_quality_score',f.data_quality_score
 ) AS snapshot,f.is_protected AS protected,f.current_revision AS food_revision,
 CASE WHEN f.is_protected THEN NULL
 WHEN f.source='usda' AND u.fdc_id IS NOT NULL THEN jsonb_build_object(
  'provider','usda','source_id',u.fdc_id,'portion_evidence',jsonb_build_object(
   'version',u.payload->'version','fdcId',u.payload->'fdcId','provider','usda',
   'foodDescription',u.payload->'foodDescription','dataType',u.payload->'dataType','retrievedAt',u.payload->'retrievedAt',
   'portions',(SELECT jsonb_agg(jsonb_build_object('key',p.value->'key','amount',p.value->'amount','grams',p.value->'grams','description',p.value->'description','sourcePortionId',p.value->'sourcePortionId') ORDER BY p.ordinality)
    FROM jsonb_array_elements(u.payload->'portions') WITH ORDINALITY p(value,ordinality))))
 WHEN f.source='openfoodfacts' AND o.source_id IS NOT NULL THEN jsonb_build_object(
  'provider','openfoodfacts','source_id',o.source_id,'retrieved_at',o.captured_at,'serving_source',o.serving_source)
 ELSE NULL END AS portion_source
 FROM foods f
 LEFT JOIN macrogoal_food_private.usda_portions u ON NOT f.is_protected AND f.source='usda'
  AND f.usda_fdc_id ~ '^[0-9]{1,20}$' AND u.fdc_id=f.usda_fdc_id
  AND u.fetched_at>now()-interval '30 days' AND u.fetched_at<=now()
  AND u.payload->>'fdcId'=f.usda_fdc_id AND u.payload->>'provider'='usda'
  AND u.payload->>'version'='1' AND CASE WHEN jsonb_typeof(u.payload->'portions')='array' THEN jsonb_array_length(u.payload->'portions') BETWEEN 1 AND 64 ELSE false END
 LEFT JOIN LATERAL (
  SELECT s.source_id,r.captured_at,jsonb_build_object(
   'code',s.payload#>'{raw_payload,code}',
   'product_name',s.payload#>'{raw_payload,product_name}',
   'serving_size',s.payload#>'{raw_payload,serving_size}',
   'serving_quantity',s.payload#>'{raw_payload,serving_quantity}',
   'serving_quantity_unit',s.payload#>'{raw_payload,serving_quantity_unit}',
   'preparation',s.payload#>'{raw_payload,preparation}',
   'nutrition_data_prepared_per',s.payload#>'{raw_payload,nutrition_data_prepared_per}'
  ) AS serving_source
  FROM macrogoal_food_private.selected_nutrition_snapshots_v1 s
  JOIN macrogoal_food_private.selected_nutrition_receipts_v1 r ON r.snapshot_id=s.id
  WHERE NOT f.is_protected AND f.source='openfoodfacts'
   AND f.barcode ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
   AND s.provider='openfoodfacts' AND s.source_id IN(f.barcode,lpad(f.barcode,14,'0'),
    CASE WHEN length(ltrim(f.barcode,'0'))<=13 THEN lpad(ltrim(f.barcode,'0'),13,'0') END,
    CASE WHEN length(ltrim(f.barcode,'0'))<=12 THEN lpad(ltrim(f.barcode,'0'),12,'0') END,
    CASE WHEN length(ltrim(f.barcode,'0'))<=8 THEN lpad(ltrim(f.barcode,'0'),8,'0') END)
   AND s.capture_scope='detail_response' AND s.payload->>'capture_scope'='detail_response'
   AND s.payload->>'complete'='true' AND s.payload->>'provider'='openfoodfacts'
   AND s.payload->>'source_id'=s.source_id
   AND s.payload#>>'{raw_payload,code}' ~ '^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$'
   AND lpad(s.payload#>>'{raw_payload,code}',14,'0')=lpad(f.barcode,14,'0')
   AND r.food_id=f.id AND r.food_revision=f.current_revision
   AND r.received_at>now()-interval '24 hours' AND r.received_at<=now()
   AND r.captured_at>now()-interval '24 hours' AND r.captured_at<=now()
  ORDER BY r.captured_at DESC,r.received_at DESC,r.request_id DESC LIMIT 1
 ) o ON true
 ORDER BY array_position(p_food_ids,f.id);
END $function$;
REVOKE ALL ON FUNCTION public.read_catalog_portion_sources_v1(uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_catalog_portion_sources_v1(uuid[]) TO service_role;
