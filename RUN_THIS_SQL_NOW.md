
# 🚨 RUN THIS SQL NOW 🚨

## The Problem
Your mobile app shows this error:
```
Failed to save meal: Could not find the table 'public.saved_meals' in the schema cache
```

## The Fix
The tables don't exist. You need to create them.

## Steps (5 minutes)

### 1. Open Supabase Dashboard
Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/sql/new

### 2. Copy the SQL
Open the file: `CREATE_SAVED_MEALS_TABLES.sql`

Copy **ALL** of it (from the first line to the last line)

### 3. Paste and Run
- Paste into the SQL Editor
- Click the **Run** button (or press Ctrl+Enter / Cmd+Enter)
- Wait for "Success" message

### 4. Verify
Run this query to verify tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');
```

You should see:
```
table_name
-----------------
saved_meals
saved_meal_items
```

### 5. Restart Mobile App
- Close the app completely
- Reopen it
- Try saving a meal

## Expected Result

✅ No error when saving
✅ Meal appears in My Meals list
✅ Meal persists after app restart

## If It Still Doesn't Work

Check the console logs. The app now logs:
- Supabase URL being used
- Whether tables exist
- Detailed error messages

Look for lines starting with `[Supabase]` or `[MyMealsCreate]`

## That's It!

Once you run the SQL, the problem is fixed. The code changes are already deployed.
