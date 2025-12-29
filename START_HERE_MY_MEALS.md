
# My Meals Feature - Quick Start Guide

## 🚀 Getting Started

Follow these steps to enable the My Meals feature in your app.

## Step 1: Run Database Migration

1. Open your Supabase Dashboard
2. Navigate to the SQL Editor
3. Copy the entire SQL from `MY_MEALS_MIGRATION.md`
4. Paste it into the SQL Editor
5. Click "Run" to execute the migration

**Expected Result:** Two new tables created (`saved_meals` and `saved_meal_items`) with RLS policies enabled.

## Step 2: Verify Database Setup

Run this query in the SQL Editor to verify:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('saved_meals', 'saved_meal_items');
```

**Expected Result:** You should see both tables listed.

## Step 3: Test the Feature

### Test 1: Access My Meals
1. Open the app
2. Navigate to any meal (Breakfast/Lunch/Dinner/Snacks)
3. Tap "Add Food"
4. Scroll down to see "My Meals" option
5. ✅ You should see a card with "My Meals" and "Use saved meal combinations"

### Test 2: Create Your First Meal
1. Tap "My Meals"
2. ✅ You should see empty state: "No saved meals yet"
3. Tap "Create Meal" button
4. Enter a meal name (e.g., "Breakfast Bowl")
5. Tap "Add Food"
6. ✅ Verify "My Meals" option is NOT visible (no loop!)
7. Search for a food (e.g., "oatmeal")
8. Select a food and adjust servings
9. Tap "Add to Meal" (or similar button)
10. ✅ You should see "Food added to meal!" alert
11. Tap OK to return to Create Meal
12. ✅ You should see the food in your meal list
13. Add 1-2 more foods
14. Tap "Save Meal"
15. ✅ You should see "Meal saved successfully!" alert

### Test 3: Use Your Saved Meal
1. Navigate to Breakfast → Add Food → My Meals
2. ✅ You should see your saved meal in the list
3. Tap on your saved meal
4. ✅ You should see all foods in the meal
5. ✅ You should see total nutrition (calories, protein, carbs, fat)
6. Change servings to "2"
7. ✅ Nutrition should double
8. Tap "Add to Breakfast"
9. ✅ You should see "Added to Breakfast" banner
10. ✅ App should navigate to Food Home
11. ✅ All foods from the meal should be logged in Breakfast

### Test 4: Delete a Saved Meal
1. Navigate to My Meals
2. Swipe left on any meal
3. ✅ You should see a delete button
4. Tap delete
5. ✅ Meal should disappear immediately
6. Close and reopen the app
7. Navigate to My Meals
8. ✅ Deleted meal should still be gone

## Troubleshooting

### "My Meals" option not showing
**Problem:** Can't find "My Meals" in Add Food menu

**Solution:**
- Make sure you're in a meal context (Breakfast/Lunch/Dinner/Snacks)
- Make sure you're NOT inside Create Meal (that would be a loop!)
- Check console logs for context value

### Saved meals not loading
**Problem:** My Meals screen shows empty even though you created meals

**Solution:**
1. Check database migration was run successfully
2. Verify RLS policies are enabled:
```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('saved_meals', 'saved_meal_items');
```
3. Check you're logged in (saved meals are user-specific)
4. Check console logs for errors

### Foods not appearing in Create Meal
**Problem:** Added food but it doesn't show in the meal list

**Solution:**
1. Check console logs for errors
2. Verify food was added to draft (check AsyncStorage)
3. Try closing and reopening Create Meal screen
4. Check that FoodDetailsLayout is handling my_meal_builder context

### Nutrition totals incorrect
**Problem:** Totals don't match sum of individual foods

**Solution:**
1. Check that foods have per-100g values in database
2. Verify serving_amount and servings_count are correct
3. Check multiplier calculation in code
4. Look for rounding issues (should only round at display)

## Console Logs to Check

Enable console logging and look for these tags:
- `[MyMeals]` - My Meals list screen
- `[MyMealsCreate]` - Create Meal screen
- `[MyMealsDetails]` - Meal Details screen
- `[MyMealsDraft]` - Draft management
- `[FoodDetailsLayout]` - Food Details screen
- `[AddFood]` - Add Food menu

## Feature Checklist

Use this checklist to verify everything works:

- [ ] Database migration completed
- [ ] Tables created with RLS policies
- [ ] "My Meals" option visible in Add Food (meal context)
- [ ] "My Meals" option hidden in Create Meal (no loop)
- [ ] Can create a saved meal
- [ ] Can add multiple foods to a meal
- [ ] Can remove foods from a meal
- [ ] Can save a meal
- [ ] Saved meal appears in list
- [ ] Can search saved meals
- [ ] Can view meal details
- [ ] Can adjust servings multiplier
- [ ] Can add saved meal to Breakfast
- [ ] Can add saved meal to Lunch
- [ ] Can add saved meal to Dinner
- [ ] Can add saved meal to Snacks
- [ ] Can delete a saved meal
- [ ] Empty state displays correctly
- [ ] Nutrition totals calculate correctly
- [ ] Draft persists across navigation
- [ ] Draft clears after saving

## Next Steps

Once everything is working:

1. **Test with real data**: Create several meals with different foods
2. **Test edge cases**: Empty meals, single food meals, large meals
3. **Test performance**: Create 20+ meals and check loading speed
4. **Gather feedback**: Ask users what they think
5. **Plan enhancements**: Edit meals, reorder items, meal photos

## Support

If you encounter issues:

1. Check console logs first
2. Verify database migration
3. Check RLS policies
4. Review the code in the relevant screen
5. Check the implementation summary in `MY_MEALS_IMPLEMENTATION_SUMMARY.md`

## Documentation

- **`MY_MEALS_MIGRATION.md`** - Database migration SQL
- **`MY_MEALS_FEATURE_README.md`** - Detailed feature documentation
- **`MY_MEALS_IMPLEMENTATION_SUMMARY.md`** - Implementation details
- **`START_HERE_MY_MEALS.md`** - This file

---

**Ready to go!** 🎉

The My Meals feature is fully implemented and ready to use. Follow the steps above to get started.
