CREATE OR REPLACE FUNCTION public.get_unaudited_recipes()
RETURNS TABLE(id uuid, title text, description text, image_url text, ingredients jsonb, instructions jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
  SELECT r.id, r.title, r.description, r.image_url, r.ingredients, r.instructions
  FROM public.recipes r
  LEFT JOIN public.recipe_image_audits a ON a.recipe_id = r.id
  WHERE a.id IS NULL
     OR (
       a.regenerated IS NOT TRUE
       AND a.new_image_url IS NULL
       AND (NULLIF(a.image_url, '') IS NULL OR a.match IS FALSE OR a.confidence = 'low')
     )
  ORDER BY
    CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END,
    COALESCE(a.audited_at, r.created_at) ASC,
    r.created_at ASC,
    r.id ASC;
$function$;
-- Preserve internal-only access for the existing scheduled backend.
REVOKE EXECUTE ON FUNCTION public.get_unaudited_recipes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_unaudited_recipes() TO service_role;
