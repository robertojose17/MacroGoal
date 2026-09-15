-- Recipes library: persistent store for all discovered recipes
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  source_name text,
  source_url text,
  prep_time_minutes integer,
  servings integer DEFAULT 1,
  calories_per_serving numeric,
  protein_per_serving numeric,
  carbs_per_serving numeric,
  fat_per_serving numeric,
  fiber_per_serving numeric,
  ingredients jsonb DEFAULT '[]'::jsonb,
  instructions jsonb DEFAULT '[]'::jsonb,
  reviews jsonb DEFAULT '[]'::jsonb,
  tags text[] DEFAULT '{}',
  click_count integer DEFAULT 0,
  search_count integer DEFAULT 0,
  usda_verified boolean DEFAULT false,
  last_clicked_at timestamptz,
  last_searched_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  search_vector tsvector
);

CREATE INDEX IF NOT EXISTS recipes_search_vector_idx ON public.recipes USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS recipes_click_count_idx ON public.recipes(click_count DESC);
CREATE INDEX IF NOT EXISTS recipes_created_at_idx ON public.recipes(created_at DESC);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read recipes" ON public.recipes;
CREATE POLICY "Anyone can read recipes" ON public.recipes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can manage recipes" ON public.recipes;
CREATE POLICY "Service role can manage recipes" ON public.recipes FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.recipes_search_vector_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.description, '') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recipes_search_vector_trigger ON public.recipes;
CREATE TRIGGER recipes_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.recipes_search_vector_update();

CREATE OR REPLACE FUNCTION public.increment_recipe_click(recipe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.recipes SET click_count = click_count + 1, last_clicked_at = now() WHERE id = recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_recipe_search(recipe_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.recipes SET search_count = search_count + 1, last_searched_at = now() WHERE id = recipe_id;
END;
$$;
