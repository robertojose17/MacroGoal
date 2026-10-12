-- Single atomic DO statement: no food records are read or written by this installer.
DO $install$
DECLARE
  target oid := pg_catalog.to_regprocedure('public.log_food(uuid,date,text,uuid,uuid,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,timestamp with time zone)');
BEGIN
  PERFORM pg_catalog.set_config('lock_timeout','5s',true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('macrogoal:log_food:owner_guard',0));
  IF target IS NULL OR (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='log_food') <> 1 THEN
    RAISE EXCEPTION 'log_food signature drift; no changes applied';
  END IF;
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(target)) <> '73b2cbeee881a2e20ddfe478d584dfe8' OR
     (SELECT p.proacl::text FROM pg_catalog.pg_proc p WHERE p.oid=target) IS DISTINCT FROM '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' OR
     (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid=target) <> 'postgres' OR
     NOT (SELECT r.rolbypassrls FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE p.oid=target) THEN
    RAISE EXCEPTION 'log_food baseline drift; no changes applied';
  END IF;
  IF pg_catalog.has_schema_privilege('anon','public','CREATE') OR pg_catalog.has_schema_privilege('authenticated','public','CREATE') OR pg_catalog.has_schema_privilege('service_role','public','CREATE') THEN
    RAISE EXCEPTION 'public schema permits untrusted creation; no changes applied';
  END IF;
  IF pg_catalog.pg_has_role('anon','service_role','MEMBER') OR pg_catalog.pg_has_role('authenticated','service_role','MEMBER') OR
     EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcanlogin)) OR
     NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role' AND rolbypassrls AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcanlogin) OR
     NOT pg_catalog.pg_has_role('authenticator','service_role','MEMBER') THEN
    RAISE EXCEPTION 'request-role trust baseline drift; no changes applied';
  END IF;
  EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.log_food(p_user_id uuid, p_date date, p_meal_type text, p_food_id uuid DEFAULT NULL::uuid, p_food_item_id uuid DEFAULT NULL::uuid, p_food_name text DEFAULT NULL::text, p_food_brand text DEFAULT NULL::text, p_calories numeric DEFAULT 0, p_protein numeric DEFAULT 0, p_carbs numeric DEFAULT 0, p_fats numeric DEFAULT 0, p_fiber numeric DEFAULT 0, p_grams numeric DEFAULT NULL::numeric, p_serving_description text DEFAULT NULL::text, p_quantity numeric DEFAULT 1, p_logged_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_meal_id uuid;
  v_meal_item_id uuid;
  v_food_item_id uuid := p_food_item_id;
  v_food_name text := p_food_name;
  v_food_brand text := p_food_brand;
  v_food_row record;
BEGIN
  -- Trust the database request role, never a caller-supplied user ID alone.
  IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not authorized to log food for this user'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required' USING ERRCODE = '22004';
  END IF;

  IF p_meal_type NOT IN ('breakfast','lunch','dinner','snacks','snack') THEN
    RAISE EXCEPTION 'Invalid meal_type: %', p_meal_type;
  END IF;
  IF p_calories < 0 OR p_calories > 99999 THEN
    RAISE EXCEPTION 'calories out of range: %', p_calories;
  END IF;
  IF p_protein < 0 OR p_carbs < 0 OR p_fats < 0 THEN
    RAISE EXCEPTION 'macros cannot be negative';
  END IF;

  IF v_food_item_id IS NULL AND p_food_id IS NOT NULL THEN
    SELECT id INTO v_food_item_id
    FROM public.food_items
    WHERE source = 'foods' AND source_id = p_food_id::text
    LIMIT 1;

    IF v_food_item_id IS NULL THEN
      SELECT * INTO v_food_row FROM public.foods WHERE id = p_food_id;
      IF FOUND THEN
        IF v_food_row.barcode IS NOT NULL THEN
          SELECT id INTO v_food_item_id
          FROM public.food_items
          WHERE barcode = v_food_row.barcode
          LIMIT 1;
        END IF;

        IF v_food_item_id IS NULL THEN
          SELECT id INTO v_food_item_id
          FROM public.food_items
          WHERE lower(name) = lower(v_food_row.name)
            AND (
              (v_food_row.brand IS NULL AND brand IS NULL)
              OR lower(brand) = lower(v_food_row.brand)
            )
          LIMIT 1;
        END IF;

        -- Fourth: insert a new food_items row only for real (non-user-created) foods
        IF v_food_item_id IS NULL AND v_food_row.user_created IS NOT TRUE THEN
          INSERT INTO public.food_items (
            name, brand, barcode,
            calories, protein, carbs, fat, fiber,
            serving_size, serving_unit, serving_description, serving_count,
            source, source_id, macros_per
          ) VALUES (
            v_food_row.name, v_food_row.brand, v_food_row.barcode,
            v_food_row.calories, v_food_row.protein, v_food_row.carbs,
            v_food_row.fats, v_food_row.fiber,
            COALESCE(v_food_row.serving_amount, 100),
            COALESCE(v_food_row.serving_unit, 'g'),
            NULL, 1,
            'foods', p_food_id::text,
            CASE WHEN COALESCE(v_food_row.serving_amount, 100) = 100 THEN '100g' ELSE 'serving' END
          )
          RETURNING id INTO v_food_item_id;
        END IF;
      END IF;
    END IF;
  END IF;

  IF (v_food_name IS NULL OR v_food_name = '') AND v_food_item_id IS NOT NULL THEN
    SELECT name, brand INTO v_food_name, v_food_brand
    FROM public.food_items WHERE id = v_food_item_id;
  END IF;

  IF (v_food_name IS NULL OR v_food_name = '') AND p_food_id IS NOT NULL THEN
    SELECT name, brand INTO v_food_name, v_food_brand
    FROM public.foods WHERE id = p_food_id;
  END IF;

  INSERT INTO public.meals (user_id, date, meal_type, updated_at)
  VALUES (p_user_id, p_date, p_meal_type, now())
  ON CONFLICT (user_id, date, meal_type)
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_meal_id;

  INSERT INTO public.meal_items (
    meal_id, food_id, food_item_id,
    food_name, food_brand,
    calories, protein, carbs, fats, fiber, grams,
    serving_description, quantity, logged_at
  ) VALUES (
    v_meal_id,
    p_food_id,
    v_food_item_id,
    v_food_name,
    v_food_brand,
    p_calories, p_protein, p_carbs, p_fats, p_fiber, p_grams,
    p_serving_description, p_quantity,
    COALESCE(p_logged_at, now())
  )
  RETURNING id INTO v_meal_item_id;

  RETURN json_build_object(
    'meal_id', v_meal_id,
    'meal_item_id', v_meal_item_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_food(uuid,date,text,uuid,uuid,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_food(uuid,date,text,uuid,uuid,text,text,numeric,numeric,numeric,numeric,numeric,numeric,text,numeric,timestamp with time zone) TO authenticated, service_role;
$ddl$;
  IF (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc p WHERE p.oid=target) <> '20fa2cc3e2ff5adbc141e3af98d6f97b' OR
     (SELECT p.proconfig FROM pg_catalog.pg_proc p WHERE p.oid=target) IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[] OR
     pg_catalog.has_function_privilege('anon',target,'EXECUTE') OR
     NOT pg_catalog.has_function_privilege('authenticated',target,'EXECUTE') OR
     NOT pg_catalog.has_function_privilege('service_role',target,'EXECUTE') THEN
    RAISE EXCEPTION 'log_food postcondition failed; rolled back';
  END IF;
END;
$install$;
