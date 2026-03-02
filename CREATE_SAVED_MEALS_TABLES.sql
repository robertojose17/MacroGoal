
-- ============================================================
-- CRITICAL FIX: CREATE SAVED MEALS TABLES
-- ============================================================
-- This migration creates the saved_meals and saved_meal_items tables
-- that are required for the My Meals feature to work.
--
-- ROOT CAUSE: Tables do not exist in the database
--
-- HOW TO APPLY:
-- 1. Go to Supabase Dashboard (https://supabase.com/dashboard)
-- 2. Select project: esgptfiofoaeguslgvcq
-- 3. Navigate to SQL Editor
-- 4. Copy and paste this ENTIRE SQL script
-- 5. Click "Run" to execute
-- 6. Verify tables were created (see verification queries at bottom)
-- ============================================================

-- ============================================================
-- CREATE TABLES
-- ============================================================

-- Create saved_meals table
CREATE TABLE IF NOT EXISTS saved_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create saved_meal_items table
CREATE TABLE IF NOT EXISTS saved_meal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saved_meal_id UUID NOT NULL REFERENCES saved_meals(id) ON DELETE CASCADE,
    food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    serving_amount NUMERIC NOT NULL,
    serving_unit TEXT NOT NULL,
    servings_count NUMERIC NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- CREATE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_saved_meals_user_id ON saved_meals(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_meals_updated_at ON saved_meals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_saved_meal_id ON saved_meal_items(saved_meal_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_food_id ON saved_meal_items(food_id);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_meal_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DROP EXISTING POLICIES (to avoid conflicts if re-running)
-- ============================================================

DROP POLICY IF EXISTS "Users can view their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can insert their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can update their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can delete their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can view items of their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can insert items to their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can update items of their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can delete items of their saved meals" ON saved_meal_items;

-- ============================================================
-- CREATE RLS POLICIES FOR saved_meals
-- ============================================================

CREATE POLICY "Users can view their own saved meals"
ON saved_meals
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own saved meals"
ON saved_meals
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own saved meals"
ON saved_meals
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own saved meals"
ON saved_meals
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- CREATE RLS POLICIES FOR saved_meal_items
-- ============================================================

CREATE POLICY "Users can view items of their saved meals"
ON saved_meal_items
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM saved_meals
        WHERE saved_meals.id = saved_meal_items.saved_meal_id
        AND saved_meals.user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert items to their saved meals"
ON saved_meal_items
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM saved_meals
        WHERE saved_meals.id = saved_meal_items.saved_meal_id
        AND saved_meals.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update items of their saved meals"
ON saved_meal_items
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM saved_meals
        WHERE saved_meals.id = saved_meal_items.saved_meal_id
        AND saved_meals.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM saved_meals
        WHERE saved_meals.id = saved_meal_items.saved_meal_id
        AND saved_meals.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete items of their saved meals"
ON saved_meal_items
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM saved_meals
        WHERE saved_meals.id = saved_meal_items.saved_meal_id
        AND saved_meals.user_id = auth.uid()
    )
);

-- ============================================================
-- CREATE TRIGGER FOR AUTO-UPDATING updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_saved_meals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_saved_meals_updated_at_trigger ON saved_meals;
CREATE TRIGGER update_saved_meals_updated_at_trigger
BEFORE UPDATE ON saved_meals
FOR EACH ROW
EXECUTE FUNCTION update_saved_meals_updated_at();

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these queries after the migration to verify everything is set up correctly:

-- 1. Check if tables exist (should return 2 rows)
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');

-- 2. Check RLS policies for saved_meals (should return 4 rows)
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'saved_meals'
ORDER BY policyname;

-- 3. Check RLS policies for saved_meal_items (should return 4 rows)
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'saved_meal_items'
ORDER BY policyname;

-- 4. Check indexes (should return 4 rows)
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('saved_meals', 'saved_meal_items')
ORDER BY tablename, indexname;

-- ============================================================
-- SUCCESS MESSAGE
-- ============================================================
-- If all verification queries return the expected number of rows,
-- the migration was successful!
--
-- Next steps:
-- 1. Restart your mobile app
-- 2. Try to save a meal
-- 3. Verify it appears in the My Meals list
-- ============================================================
