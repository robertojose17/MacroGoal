-- Add new fields to meal_recipes for TheMealDB import and future user recipes
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'mealdb' CHECK (source IN ('mealdb', 'user'));
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS mealdb_id TEXT DEFAULT NULL;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS ingredients JSONB DEFAULT '[]'::jsonb;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS instructions TEXT DEFAULT NULL;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS created_by UUID DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT 0.00;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS approved_for_meal_plan BOOLEAN DEFAULT true;
ALTER TABLE meal_recipes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;

-- Index for fast meal planner queries (only mealdb or approved user recipes)
CREATE INDEX IF NOT EXISTS idx_meal_recipes_meal_planner ON meal_recipes (meal_type, source, approved_for_meal_plan);
CREATE INDEX IF NOT EXISTS idx_meal_recipes_mealdb_id ON meal_recipes (mealdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_recipes_mealdb_unique ON meal_recipes (mealdb_id) WHERE mealdb_id IS NOT NULL;
