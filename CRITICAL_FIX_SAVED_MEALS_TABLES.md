
# CRITICAL FIX: Saved Meals Tables Missing

## ROOT CAUSE IDENTIFIED

**Root Cause #2: The table name is NOT actually `saved_meals` in the Supabase project mobile is using**

The tables `saved_meals` and `saved_meal_items` **DO NOT EXIST** in the Supabase database. The SQL migration files were created but **NEVER APPLIED** to the database.

## EVIDENCE

1. Error message: `"Could not find the table 'public.saved_meals' in the schema cache"`
2. Mobile app is correctly configured with:
   - URL: `https://esgptfiofoaeguslgvcq.supabase.co`
   - Anon Key: `...lQWA` (last 6 chars)
   - Project ID: `esgptfiofoaeguslgvcq`
3. The code references `saved_meals` and `saved_meal_items` tables
4. Migration SQL files exist but were never executed

## IMMEDIATE FIX REQUIRED

You MUST run the SQL migration to create these tables. Follow these steps:

### Step 1: Go to Supabase Dashboard

1. Open https://supabase.com/dashboard
2. Select project: `esgptfiofoaeguslgvcq`
3. Navigate to: **SQL Editor**

### Step 2: Run the Migration SQL

Copy and paste the entire SQL from `CREATE_SAVED_MEALS_TABLES.sql` (see below) into the SQL Editor and click **Run**.

### Step 3: Verify Tables Were Created

Run this verification query:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');
```

You should see both tables listed.

### Step 4: Verify RLS Policies

Run this query to verify RLS policies were created:

```sql
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename IN ('saved_meals', 'saved_meal_items')
ORDER BY tablename, policyname;
```

You should see 4 policies for each table (SELECT, INSERT, UPDATE, DELETE).

### Step 5: Restart the Mobile App

After the migration is complete:
1. Close the mobile app completely
2. Reopen it
3. Try to save a meal

## WHAT WAS FIXED IN THE CODE

The following changes were made to prevent this issue in the future:

1. **Added diagnostic logging** in `app/integrations/supabase/client.ts`:
   - Logs the Supabase URL and anon key on startup
   - Helps verify mobile is using the correct project

2. **Created table name constants**:
   ```typescript
   export const TABLE_SAVED_MEALS = "saved_meals";
   export const TABLE_SAVED_MEAL_ITEMS = "saved_meal_items";
   ```

3. **Added database initialization function** (`initializeDatabase()`):
   - Checks if tables exist on app startup
   - Provides clear error messages if tables are missing
   - Guides user to run the migration

4. **Updated all code to use table constants**:
   - `app/my-meals-create.tsx`
   - `app/my-meals.tsx`
   - `app/my-meals-details.tsx`

## ACCEPTANCE TEST

After running the migration, perform this test on MOBILE:

1. ✅ Open the app
2. ✅ Navigate to My Meals
3. ✅ Create a new meal with 2 foods
4. ✅ Save the meal → NO ERROR
5. ✅ Verify the meal appears in the My Meals list immediately
6. ✅ Close and restart the app
7. ✅ Verify the meal still appears in the My Meals list

## FILES CHANGED

1. `app/integrations/supabase/client.ts` - Added logging, constants, and initialization function
2. `app/my-meals-create.tsx` - Updated to use table constants and call initialization
3. `app/my-meals.tsx` - Updated to use table constants
4. `app/my-meals-details.tsx` - Updated to use table constants
5. `CREATE_SAVED_MEALS_TABLES.sql` - SQL migration to create tables (NEW FILE)

## NEXT STEPS

1. **IMMEDIATELY**: Run the SQL migration in Supabase Dashboard
2. **VERIFY**: Check that tables exist using verification queries
3. **TEST**: Perform the acceptance test on mobile
4. **CONFIRM**: Report back that the test passed

## WHY THIS HAPPENED

The migration SQL files (`MY_MEALS_TABLE_CREATION.sql`, `SAVED_MEALS_MIGRATION.sql`) were created as documentation but were never actually executed in the Supabase database. The Supabase client cannot create tables - they must be created through the Supabase Dashboard SQL Editor or via migrations.
