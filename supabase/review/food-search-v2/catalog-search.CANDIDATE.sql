-- REVIEW CANDIDATE ONLY. Do not apply until the exact RPC/grants are approved.
-- No catalog writes, backfill, index creation, policy changes or existing RPC edits.
BEGIN;
CREATE FUNCTION public.search_food_catalog_v2(p_query text, p_limit integer DEFAULT 30)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '1200ms'
AS $function$
DECLARE
  v_query tsquery;
  v_normalized text;
BEGIN
  IF p_query IS NULL OR length(p_query) > 160 OR p_limit IS NULL
     OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid catalog query' USING ERRCODE = '22023';
  END IF;
  v_normalized := btrim(regexp_replace(lower(p_query), '[^a-z0-9]+', ' ', 'g'));
  IF length(v_normalized) < 2 OR cardinality(string_to_array(v_normalized, ' ')) > 12 THEN
    RETURN;
  END IF;
  -- Parameter values never become SQL. Prefixes begin at lexeme boundaries:
  -- apple matches apple/apples, not pineapple. Punctuation does not impose order.
  SELECT to_tsquery('simple'::regconfig, string_agg(quote_literal(token) || ':*', ' & '))
  INTO v_query FROM unnest(string_to_array(v_normalized, ' ')) AS words(token);

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT f.id,f.barcode,f.name,f.brand,f.product_name,f.generic_name,f.brands,
      f.calories,f.protein,f.carbs,f.fat,f.fiber,f.serving_size,f.serving_unit,
      f.serving_quantity,f.macros_per,f.nutriments,f.nutriscore_grade,
      f.popularity_score,f.search_count,f.logs_last_30d,f.data_quality_score,
      f.usda_fdc_id,f.source,f.off_data,f.image_url,
      coalesce(nullif(btrim(f.product_name),''),f.name,'') AS display_name,
      coalesce(nullif(btrim(f.brands),''),f.brand,'') AS display_brand
    FROM public.food_items AS f
    WHERE to_tsvector('simple'::regconfig,coalesce(f.name,'') || ' ' || coalesce(f.brand,'')) @@ v_query
  ), ranked AS (
    SELECT c.*,
      CASE WHEN btrim(c.display_brand) = ''
        AND lower(c.display_name) !~ '\m(breaded|deli|roll|sandwich|soup|nugget|nuggets|juice|pie|candy|baby|restaurant|luncheon|pizza|sausage|patties|patty)\M'
        THEN 1 ELSE 0 END AS basic_food,
      ts_rank_cd(to_tsvector('simple'::regconfig,coalesce(c.name,'') || ' ' || coalesce(c.brand,'')),v_query) AS text_rank
    FROM candidates AS c
  )
  SELECT (to_jsonb(r) - ARRAY['display_name','display_brand','basic_food','text_rank'])
      || jsonb_build_object('_search_basic',r.basic_food = 1)
  FROM ranked AS r
  ORDER BY r.basic_food DESC,
    (lower(r.display_name) = v_normalized) DESC,
    r.text_rank DESC,
    length(r.display_name),lower(r.display_name),r.id
  LIMIT p_limit;
END;
$function$;
-- Default PUBLIC execute must be removed atomically with creation.
REVOKE ALL ON FUNCTION public.search_food_catalog_v2(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_food_catalog_v2(text,integer) TO service_role;
COMMIT;
