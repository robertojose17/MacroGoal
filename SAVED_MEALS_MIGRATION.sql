
-- ============================================
-- SAVED MEALS TABLES MIGRATION
-- This creates the missing tables that are causing the save error
-- ============================================

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saved_meals_user_id ON saved_meals(user_id);
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

-- ============================================
-- RLS POLICIES FOR saved_meals
-- ============================================

-- Users can view their own saved meals
CREATE POLICY "Users can view their own saved meals"
  ON saved_meals FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own saved meals
CREATE POLICY "Users can insert their own saved meals"
  ON saved_meals FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own saved meals
CREATE POLICY "Users can update their own saved meals"
  ON saved_meals FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own saved meals
CREATE POLICY "Users can delete their own saved meals"
  ON saved_meals FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES FOR saved_meal_items
-- ============================================

-- Users can view items of their saved meals
CREATE POLICY "Users can view items of their saved meals"
  ON saved_meal_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

-- Users can insert items to their saved meals
CREATE POLICY "Users can insert items to their saved meals"
  ON saved_meal_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

-- Users can update items of their saved meals
CREATE POLICY "Users can update items of their saved meals"
  ON saved_meal_items FOR UPDATE
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

-- Users can delete items of their saved meals
CREATE POLICY "Users can delete items of their saved meals"
  ON saved_meal_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

-- ============================================
-- TRIGGER FOR AUTO-UPDATING updated_at
-- ============================================

-- Create a function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_meals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at on saved_meals
DROP TRIGGER IF EXISTS update_saved_meals_updated_at_trigger ON saved_meals;
CREATE TRIGGER update_saved_meals_updated_at_trigger
  BEFORE UPDATE ON saved_meals
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_meals_updated_at();

-- ============================================
-- VERIFICATION QUERIES (optional - run these to verify)
-- ============================================

-- Check if tables were created
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('saved_meals', 'saved_meal_items');

-- Check RLS policies
-- SELECT * FROM pg_policies WHERE tablename IN ('saved_meals', 'saved_meal_items');
