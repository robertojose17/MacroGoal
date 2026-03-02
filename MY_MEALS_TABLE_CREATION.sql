
-- ============================================================
-- MY MEALS TABLES CREATION MIGRATION
-- ============================================================
-- This migration creates the saved_meals and saved_meal_items tables
-- with proper RLS policies and indexes for the My Meals feature.
--
-- ROOT CAUSE: A) The tables truly did not exist in Supabase
--
-- HOW TO APPLY:
-- 1. Go to your Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire SQL script
-- 4. Click "Run" to execute
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_saved_meals_user_id ON saved_meals(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_meals_updated_at ON saved_meals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_saved_meal_id ON saved_meal_items(saved_meal_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_food_id ON saved_meal_items(food_id);

-- Enable Row Level Security
ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_meal_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can insert their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can update their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can delete their own saved meals" ON saved_meals;
DROP POLICY IF EXISTS "Users can view items of their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can insert items to their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can update items of their saved meals" ON saved_meal_items;
DROP POLICY IF EXISTS "Users can delete items of their saved meals" ON saved_meal_items;

-- Create RLS policies for saved_meals
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

-- Create RLS policies for saved_meal_items
CREATE POLICY "Users can view items of their saved meals"
ON saved_meal_items
FOR SELECT
TO authenticated
USING (
    saved_meal_id IN (
        SELECT id FROM saved_meals WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert items to their saved meals"
ON saved_meal_items
FOR INSERT
TO authenticated
WITH CHECK (
    saved_meal_id IN (
        SELECT id FROM saved_meals WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can update items of their saved meals"
ON saved_meal_items
FOR UPDATE
TO authenticated
USING (
    saved_meal_id IN (
        SELECT id FROM saved_meals WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    saved_meal_id IN (
        SELECT id FROM saved_meals WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete items of their saved meals"
ON saved_meal_items
FOR DELETE
TO authenticated
USING (
    saved_meal_id IN (
        SELECT id FROM saved_meals WHERE user_id = auth.uid()
    )
);

-- Create trigger to update updated_at timestamp
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

-- 1. Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');

-- 2. Check RLS policies for saved_meals
SELECT * FROM pg_policies WHERE tablename = 'saved_meals';

-- 3. Check RLS policies for saved_meal_items
SELECT * FROM pg_policies WHERE tablename = 'saved_meal_items';

-- 4. Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('saved_meals', 'saved_meal_items');
