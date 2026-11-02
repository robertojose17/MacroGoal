-- REVIEW CANDIDATE ONLY. No application without exact RPC/grant approval.
-- Uses the existing expression GIN; no catalog/index/policy changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.search_food_catalog_v2(p_queries text[], p_limit integer DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_query tsquery;
  v_queries text[];
  v_tokens text[];
  v_heads text[];
BEGIN
  IF p_queries IS NULL OR cardinality(p_queries) NOT BETWEEN 1 AND 2
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR EXISTS (SELECT 1 FROM unnest(p_queries) q WHERE q IS NULL OR length(q) > 160) THEN
    RAISE EXCEPTION 'Invalid catalog query' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(btrim(regexp_replace(lower(q),'[^[:alnum:]]+',' ','g')))
    INTO v_queries FROM unnest(p_queries) q;
  IF EXISTS (SELECT 1 FROM unnest(v_queries) q WHERE length(q) < 2
      OR cardinality(string_to_array(q,' ')) > 12) THEN RETURN; END IF;
  SELECT to_tsquery('simple'::regconfig,string_agg('(' || terms || ')',' | '))
  INTO v_query FROM (
    SELECT string_agg(quote_literal(token) || ':*',' & ') terms
    FROM unnest(v_queries) WITH ORDINALITY AS queries(q,n),
      LATERAL unnest(string_to_array(q,' ')) AS words(token) GROUP BY n
  ) variants;
  SELECT array_agg(DISTINCT regexp_replace(token,'s$','')) INTO v_tokens
    FROM unnest(v_queries) q,LATERAL unnest(string_to_array(q,' ')) token;
  SELECT array_agg(regexp_replace(split_part(q,' ',1),'s$','')) INTO v_heads FROM unnest(v_queries) q;

  RETURN QUERY
  WITH alternate_names AS MATERIALIZED (
    -- Only 263 nonempty generic names / one divergent product+brand in the
    -- audited catalog. Materialize this small lane before evaluating its FTS.
    SELECT f.id,f.name,f.brand,f.product_name,f.generic_name,f.brands
    FROM public.food_items f
    WHERE nullif(btrim(f.generic_name),'') IS NOT NULL
      OR (nullif(btrim(f.product_name),'') IS NOT NULL AND f.product_name IS DISTINCT FROM f.name)
      OR (nullif(btrim(f.brands),'') IS NOT NULL AND f.brands IS DISTINCT FROM f.brand)
  ), matched_ids AS MATERIALIZED (
    SELECT f.id FROM public.food_items f
    WHERE to_tsvector('simple'::regconfig,coalesce(f.name,'') || ' ' || coalesce(f.brand,'')) @@ v_query
    UNION
    SELECT a.id FROM alternate_names a
    WHERE to_tsvector('simple'::regconfig,concat_ws(' ',a.name,a.brand,a.product_name,a.generic_name,a.brands)) @@ v_query
  ), names AS MATERIALIZED (
    SELECT f.id,coalesce(nullif(btrim(f.product_name),''),nullif(btrim(f.name),''),f.generic_name,'') display_name,
      coalesce(nullif(btrim(f.brands),''),f.brand,'') display_brand,
      concat_ws(' ',f.name,f.brand,f.product_name,f.generic_name,f.brands) matching_text
    FROM matched_ids m JOIN public.food_items f ON f.id=m.id
    WHERE (f.calories > 0 OR f.protein > 0 OR f.carbs > 0 OR f.fat > 0)
      AND coalesce(f.calories,0) >= 0 AND coalesce(f.protein,0) >= 0
      AND coalesce(f.carbs,0) >= 0 AND coalesce(f.fat,0) >= 0
  ), ranked AS (
    SELECT n.*, NOT (NOT EXISTS (SELECT 1 FROM unnest(ARRAY['fried','stuffed','powder','novelty','novelties','sweetened','sauce','mix','smoothie','breaded','deli','roll','sandwich','soup','nugget','nuggets','juice','pie','candy','baby','restaurant','luncheon','pizza','sausage','patties','patty','salad','canned','smoked','oil','capsule','capsules','supplement','supplements','meatless','vegan','vegetarian','plant based','yolk','egg white','egg whites','acid','fluid']) term WHERE (' '||regexp_replace(lower(n.display_name),'[^[:alnum:]]+',' ','g')||' ') LIKE '% '||term||' %' AND NOT EXISTS(SELECT 1 FROM unnest(v_queries) q WHERE (' '||q||' ') LIKE '% '||term||' %'))) AS unrequested_variant,
      (btrim(n.display_brand) = '' AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['fried','stuffed','powder','novelty','novelties','sweetened','sauce','mix','smoothie','breaded','deli','roll','sandwich','soup','nugget','nuggets','juice','pie','candy','baby','restaurant','luncheon','pizza','sausage','patties','patty','salad','canned','smoked','oil','capsule','capsules','supplement','supplements','meatless','vegan','vegetarian','plant based','yolk','egg white','egg whites','acid','fluid']) term WHERE (' '||regexp_replace(lower(n.display_name),'[^[:alnum:]]+',' ','g')||' ') LIKE '% '||term||' %' AND NOT EXISTS(SELECT 1 FROM unnest(v_queries) q WHERE (' '||q||' ') LIKE '% '||term||' %'))
       AND EXISTS (SELECT 1 FROM unnest(ARRAY[split_part(n.display_name,',',1),split_part(n.display_name,',',2)]) segment
         WHERE regexp_replace(lower(substring(btrim(segment) FROM '^[[:alnum:]]+')),'s$','') = ANY(v_tokens)
         AND NOT EXISTS (SELECT 1 FROM regexp_split_to_table(lower(segment),'[^[:alnum:]]+') word
           WHERE word <> '' AND regexp_replace(word,'s$','') <> ALL(v_tokens)
           AND word <> ALL(ARRAY['raw','fresh','plain','cooked','boneless','skinless','whole','white','brown','red','green','ground'])))) AS basic_food,
      ts_rank_cd(to_tsvector('simple'::regconfig,n.matching_text),v_query) text_rank
    FROM names n
  ), selected AS MATERIALIZED (
    SELECT r.id,r.basic_food,row_number() OVER (ORDER BY r.unrequested_variant ASC,r.basic_food DESC,
      (lower(r.display_name) = ANY(v_queries)) DESC,r.text_rank DESC,
      length(r.display_name),lower(r.display_name),r.id) ordinal
    FROM ranked r
    ORDER BY r.unrequested_variant ASC,r.basic_food DESC,(lower(r.display_name) = ANY(v_queries)) DESC,
      r.text_rank DESC,length(r.display_name),lower(r.display_name),r.id
    LIMIT p_limit
  )
  SELECT jsonb_build_object('id',f.id,'barcode',f.barcode,'name',f.name,'brand',f.brand,
    'product_name',f.product_name,'generic_name',f.generic_name,'brands',f.brands,
    'calories',f.calories,'protein',f.protein,'carbs',f.carbs,'fat',f.fat,'fiber',f.fiber,
    'serving_size',f.serving_size,'serving_unit',f.serving_unit,'serving_quantity',f.serving_quantity,
    'macros_per',f.macros_per,'nutriments',f.nutriments,'nutriscore_grade',f.nutriscore_grade,
    'popularity_score',f.popularity_score,'search_count',f.search_count,'logs_last_30d',f.logs_last_30d,
    'data_quality_score',f.data_quality_score,'usda_fdc_id',f.usda_fdc_id,'source',f.source,
    'off_data',f.off_data,'image_url',f.image_url,'_search_basic',s.basic_food)
  FROM selected s JOIN public.food_items f ON f.id=s.id ORDER BY s.ordinal;
END;
$function$;
REVOKE ALL ON FUNCTION public.search_food_catalog_v2(text[],integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_catalog_v2(text[],integer) TO service_role;
COMMIT;
