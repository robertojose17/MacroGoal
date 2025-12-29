
# My Meals Feature - Database Migration

This document contains the SQL migration that needs to be applied to enable the "My Meals" feature.

## Migration SQL

Run the following SQL in your Supabase SQL Editor:

```sql
-- Create saved_meals table
CREATE TABLE IF NOT EXISTS saved_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create saved_meal_items table
CREATE TABLE IF NOT EXISTS saved_meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_meal_id UUID NOT NULL REFERENCES saved_meals(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  serving_amount NUMERIC NOT NULL,
  serving_unit TEXT NOT NULL,
  servings_count NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on saved_meals
ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;

-- RLS policies for saved_meals
CREATE POLICY "Users can view their own saved meals"
  ON saved_meals FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own saved meals"
  ON saved_meals FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own saved meals"
  ON saved_meals FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own saved meals"
  ON saved_meals FOR DELETE
  USING (user_id = auth.uid());

-- Enable RLS on saved_meal_items
ALTER TABLE saved_meal_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for saved_meal_items
CREATE POLICY "Users can view items in their saved meals"
  ON saved_meal_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create items in their saved meals"
  ON saved_meal_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in their saved meals"
  ON saved_meal_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items in their saved meals"
  ON saved_meal_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals
      WHERE saved_meals.id = saved_meal_items.saved_meal_id
      AND saved_meals.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_saved_meals_user_id ON saved_meals(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_saved_meal_id ON saved_meal_items(saved_meal_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_food_id ON saved_meal_items(food_id);
```

## Verification

After running the migration, verify that the tables were created successfully:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');

-- Check RLS policies
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('saved_meals', 'saved_meal_items');
```

## Data Model

### saved_meals
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key to auth.users)
- `name` (TEXT)
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### saved_meal_items
- `id` (UUID, Primary Key)
- `saved_meal_id` (UUID, Foreign Key to saved_meals)
- `food_id` (UUID, Foreign Key to foods)
- `serving_amount` (NUMERIC) - grams per serving
- `serving_unit` (TEXT) - e.g., "g", "oz"
- `servings_count` (NUMERIC) - number of servings
- `created_at` (TIMESTAMPTZ)

## Notes

- All tables have Row Level Security (RLS) enabled
- Users can only access their own saved meals
- Deleting a saved meal will cascade delete all its items
- Indexes are created for optimal query performance
