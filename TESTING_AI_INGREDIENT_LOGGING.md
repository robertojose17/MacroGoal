
# Testing Guide: AI Meal Estimator Individual Ingredient Logging

## Overview
This guide helps you test the new feature where AI-estimated meals are logged as **individual ingredients** instead of a single combined entry.

## Pre-Testing Setup

1. **Ensure you're logged in**
   - The feature requires authentication
   - Create an account or log in if needed

2. **Clear any test data** (optional)
   - Navigate to the diary for today
   - Delete any existing test meals to start fresh

## Test Scenarios

### Test 1: Basic Ingredient Logging

**Steps:**
1. Open the app and navigate to **Add Food**
2. Tap **AI Meal Estimator**
3. Describe a simple meal, e.g., "Grilled chicken breast 6oz with 1 cup steamed broccoli"
4. Wait for AI response
5. Verify the chat shows ingredient breakdown (should see 2 ingredients)
6. Tap **"Log this meal"**
7. Wait for success message
8. Navigate back to home/diary

**Expected Results:**
- ✅ Success message shows "Added 2 ingredients to [meal type]"
- ✅ Diary shows **2 separate entries**:
  - "Grilled chicken breast (AI Estimated)" with ~6oz serving
  - "Steamed broccoli (AI Estimated)" with ~1 cup serving
- ✅ Each entry shows its own calories and macros
- ✅ Totals at top match sum of both entries

### Test 2: Complex Meal with Multiple Ingredients

**Steps:**
1. Open **AI Meal Estimator**
2. Describe a complex meal: "Chipotle bowl with chicken, no rice, black beans, fajita veggies, pico de gallo, cheese, sour cream, and guacamole"
3. Wait for AI response
4. Verify ingredient breakdown (should see 7-8 ingredients)
5. Tap **"Log this meal"**
6. Check diary

**Expected Results:**
- ✅ Success message shows correct count (e.g., "Added 7 ingredients")
- ✅ Diary shows **7 separate entries**, one for each ingredient
- ✅ Each ingredient has realistic quantities and macros
- ✅ All entries have "(AI Estimated)" suffix

### Test 3: Editing Quantities Before Logging

**Steps:**
1. Open **AI Meal Estimator**
2. Describe: "Oatmeal with banana and peanut butter"
3. Wait for AI response
4. In the ingredient list, **change the peanut butter quantity** from (e.g.) 2 tbsp to 1 tbsp
5. Verify totals update automatically
6. Tap **"Log this meal"**
7. Check diary

**Expected Results:**
- ✅ Totals in chat update when quantity changes
- ✅ Diary shows peanut butter with **edited quantity** (1 tbsp)
- ✅ Peanut butter calories/macros reflect the edited amount
- ✅ Other ingredients unchanged

### Test 4: Removing Ingredients Before Logging

**Steps:**
1. Open **AI Meal Estimator**
2. Describe: "Burger with fries and a coke"
3. Wait for AI response (should show 3 ingredients)
4. **Uncheck/toggle off** the "coke" ingredient
5. Verify totals update (should decrease)
6. Tap **"Log this meal"**
7. Check diary

**Expected Results:**
- ✅ Totals in chat decrease when ingredient is removed
- ✅ Diary shows only **2 entries** (burger and fries)
- ✅ Coke is **not logged**
- ✅ Success message shows "Added 2 ingredients"

### Test 5: Editing Individual Ingredients in Diary

**Steps:**
1. Log a meal with multiple ingredients (use any previous test)
2. Navigate to diary
3. **Tap on one ingredient** entry
4. Edit the quantity or macros
5. Save changes
6. Return to diary

**Expected Results:**
- ✅ Can tap individual ingredient to open edit screen
- ✅ Can modify quantity, calories, macros
- ✅ Changes save successfully
- ✅ Diary totals update to reflect changes
- ✅ Other ingredients remain unchanged

### Test 6: Deleting Individual Ingredients from Diary

**Steps:**
1. Log a meal with multiple ingredients
2. Navigate to diary
3. **Delete one ingredient** (swipe or tap delete)
4. Confirm deletion
5. Check diary

**Expected Results:**
- ✅ Selected ingredient is removed
- ✅ Other ingredients remain in diary
- ✅ Diary totals update (decrease)
- ✅ Can delete ingredients one by one

### Test 7: No Ingredients Included (Error Case)

**Steps:**
1. Open **AI Meal Estimator**
2. Describe any meal
3. Wait for AI response
4. **Uncheck ALL ingredients** (toggle all off)
5. Tap **"Log this meal"**

**Expected Results:**
- ✅ Alert shows: "Please include at least one ingredient to log this meal"
- ✅ No navigation occurs
- ✅ Can re-enable ingredients and try again

### Test 8: Different Meal Types

**Steps:**
1. From home, tap **Breakfast** → Add Food → AI Meal Estimator
2. Describe a breakfast meal
3. Log it
4. Verify it appears in **Breakfast** section
5. Repeat for **Lunch**, **Dinner**, and **Snack**

**Expected Results:**
- ✅ Ingredients log to correct meal type
- ✅ Each meal type shows its own ingredients
- ✅ No cross-contamination between meal types

### Test 9: Multiple AI Meals in Same Day

**Steps:**
1. Log an AI meal to Breakfast (e.g., "Eggs and toast")
2. Log another AI meal to Lunch (e.g., "Chicken salad")
3. Log another to Dinner (e.g., "Salmon with rice")
4. Check diary

**Expected Results:**
- ✅ All ingredients appear in correct meal sections
- ✅ Each meal's ingredients are grouped together
- ✅ Daily totals include all ingredients from all meals
- ✅ No mixing of ingredients between meals

### Test 10: AI Meal + Manual Foods

**Steps:**
1. Manually add a food to Breakfast (e.g., search for "Coffee")
2. Then use AI Meal Estimator to add "Scrambled eggs with cheese"
3. Check diary

**Expected Results:**
- ✅ Breakfast shows both manual food AND AI ingredients
- ✅ AI ingredients have "(AI Estimated)" suffix
- ✅ Manual food does NOT have suffix
- ✅ All items can be edited/deleted independently

## Edge Cases to Test

### Edge Case 1: Network Error During Logging

**Steps:**
1. Turn on airplane mode or disable network
2. Try to log an AI meal
3. Observe behavior

**Expected Results:**
- ✅ Shows error message
- ✅ Does not crash
- ✅ Can retry after re-enabling network

### Edge Case 2: Partial Failure (Simulated)

**Note:** This is hard to test without database manipulation, but the code handles it.

**Expected Behavior:**
- If some ingredients fail to log, shows: "Added X of Y ingredients. Failed: [names]"
- Successfully logged ingredients appear in diary
- Failed ingredients do not appear

### Edge Case 3: Very Long Ingredient Names

**Steps:**
1. Describe a meal with very long ingredient names
2. Log it
3. Check diary display

**Expected Results:**
- ✅ Long names display correctly (may truncate with ellipsis)
- ✅ Full name visible when tapping ingredient
- ✅ No UI overflow or layout issues

### Edge Case 4: Unusual Units

**Steps:**
1. Describe: "3 slices of pizza, 2 cups of soda, 1 handful of chips"
2. Log it
3. Check diary

**Expected Results:**
- ✅ Units like "slices", "cups", "handful" are preserved
- ✅ Serving descriptions show correctly (e.g., "3 slices")
- ✅ Macros are reasonable for the units

## Regression Testing (Ensure Nothing Broke)

### Verify Existing Flows Still Work

1. **Manual Add Food**
   - Search for a food
   - Add it to diary
   - ✅ Works as before

2. **Barcode Scan**
   - Scan a barcode
   - Add food to diary
   - ✅ Works as before

3. **Quick Add**
   - Use Quick Add (not from AI)
   - Enter calories/macros manually
   - ✅ Works as before

4. **My Meals**
   - Create a My Meal
   - Add it to diary
   - ✅ Works as before

5. **Copy From Previous**
   - Copy a meal from yesterday
   - ✅ Works as before

6. **Food Library**
   - Browse food library
   - Add a food
   - ✅ Works as before

## Performance Testing

1. **Large Meal (10+ Ingredients)**
   - Describe a very complex meal with 10+ ingredients
   - Log it
   - ✅ Completes in reasonable time (< 10 seconds)
   - ✅ No UI freezing
   - ✅ All ingredients appear in diary

2. **Multiple Rapid Logs**
   - Log 3-4 AI meals in quick succession
   - ✅ All complete successfully
   - ✅ No duplicate entries
   - ✅ No missing entries

## Mobile-Specific Testing

### iOS
- Test on iPhone (various sizes if possible)
- Verify keyboard behavior
- Check navigation animations
- Verify alerts display correctly

### Android
- Test on Android device
- Verify back button behavior
- Check keyboard behavior
- Verify alerts display correctly

## Success Criteria

All tests should pass with:
- ✅ No red error screens
- ✅ No console errors (check logs)
- ✅ Correct data in diary
- ✅ Smooth user experience
- ✅ All existing flows unchanged

## Reporting Issues

If you find any issues, please note:
1. Which test scenario failed
2. What you expected to happen
3. What actually happened
4. Any error messages or console logs
5. Device/platform (iOS/Android/Web)
6. Steps to reproduce

## Notes

- The "(AI Estimated)" suffix helps distinguish AI-generated foods from manual entries
- Each ingredient is a real food entry in the database
- Ingredients can be favorited and reused like any other food
- The Quick Add screen is no longer used for AI-estimated meals
- All ingredient data comes from the AI's structured response
