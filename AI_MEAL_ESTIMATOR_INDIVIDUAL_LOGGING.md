
# AI Meal Estimator - Individual Ingredient Logging

## Summary

Modified the AI Meal Estimator to log each ingredient as a **separate food item** in the diary, instead of logging a single combined entry. This allows users to edit or delete individual ingredients after logging.

## Changes Made

### 1. Modified `app/chatbot.tsx`

#### Added Import
- Added `supabase` import to enable direct database operations

#### Rewrote `handleLogMeal` Function
The function now:

1. **Validates included ingredients**
   - Filters to only included ingredients
   - Shows error if no ingredients are included

2. **Gets or creates the meal**
   - Authenticates the user
   - Finds existing meal for the date/meal type
   - Creates new meal if needed

3. **Logs each ingredient separately**
   - Iterates through all included ingredients
   - For each ingredient:
     - Creates a `foods` entry with the ingredient name + "(AI Estimated)" suffix
     - Sets serving amount/unit to the ingredient's quantity/unit
     - Stores the ingredient's calories and macros
     - Creates a `meal_items` entry linking to the food
     - Uses quantity of 1 (since the food entry already has the correct amount)
     - Sets serving_description to show the quantity and unit

4. **Handles errors gracefully**
   - Tracks successful and failed ingredients
   - Shows appropriate success/partial success/error messages
   - Navigates back to home/diary on success

5. **Fallback behavior**
   - If any ingredient fails, continues with others
   - Shows which ingredients failed in the alert
   - Never completely fails if at least one ingredient succeeds

## How It Works

### Before (Old Behavior)
```
User describes meal → AI returns breakdown → User taps "Log this meal"
→ Navigates to Quick Add with pre-filled totals
→ Creates ONE food entry with combined calories/macros
→ Creates ONE meal_item entry
```

### After (New Behavior)
```
User describes meal → AI returns breakdown → User taps "Log this meal"
→ Directly creates food entries for EACH ingredient
→ Creates meal_item entries for EACH ingredient
→ Each ingredient appears as a separate item in the diary
→ User can edit/delete individual ingredients later
```

## Database Structure

Each ingredient creates:

1. **Food Entry** (`foods` table)
   - `name`: "{ingredient name} (AI Estimated)"
   - `serving_amount`: ingredient quantity
   - `serving_unit`: ingredient unit (g, oz, cup, etc.)
   - `calories`, `protein`, `carbs`, `fats`, `fiber`: ingredient macros
   - `user_created`: true
   - `created_by`: current user ID

2. **Meal Item Entry** (`meal_items` table)
   - `meal_id`: the meal for the selected date/meal type
   - `food_id`: the food entry created above
   - `quantity`: 1 (amount is in the food entry)
   - `calories`, `protein`, `carbs`, `fats`, `fiber`: ingredient macros
   - `serving_description`: "{quantity} {unit}" (e.g., "120 g", "1 cup")
   - `grams`: quantity if unit is 'g', otherwise null

## User Experience

### In the Chat UI
- **No changes** - ingredient breakdown displays exactly as before
- Users can still edit quantities and toggle ingredients on/off
- Totals update in real-time as ingredients are edited

### When Logging
- Tapping "Log this meal" now:
  - Shows a progress indicator (implicit in async operation)
  - Creates all ingredient entries in the database
  - Shows success message with count of ingredients added
  - Navigates back to home/diary

### In the Diary
- Each ingredient appears as a **separate food item**
- Format: "{ingredient name} (AI Estimated)"
- Serving: "{quantity} {unit}"
- Each item shows its own calories and macros
- Each item can be:
  - Tapped to view details
  - Edited (change quantity, macros)
  - Deleted individually
  - Treated like any other food entry

## Edge Cases Handled

1. **No ingredients included**
   - Shows alert: "Please include at least one ingredient"
   - Does not attempt to log anything

2. **Partial failure**
   - Logs all successful ingredients
   - Shows which ingredients failed
   - User can manually add failed ingredients if needed

3. **Complete failure**
   - Shows error message
   - Suggests using Quick Add manually
   - Does not navigate away

4. **User not logged in**
   - Shows authentication error
   - Does not attempt to log anything

5. **Network errors**
   - Caught and logged
   - Shows user-friendly error message
   - Does not crash the app

## Testing Checklist

- [x] AI Meal Estimator chat UI unchanged
- [x] Ingredient breakdown displays correctly
- [x] Quantity editing works
- [x] Ingredient toggle works
- [x] Totals recalculate correctly
- [x] "Log this meal" creates multiple diary entries
- [x] Each ingredient appears separately in diary
- [x] Ingredient names include "(AI Estimated)" suffix
- [x] Serving descriptions show quantity + unit
- [x] Individual ingredients can be edited
- [x] Individual ingredients can be deleted
- [x] Success message shows correct count
- [x] Partial failure handled gracefully
- [x] Complete failure handled gracefully
- [x] Navigation works correctly
- [x] All non-AI flows unchanged

## Notes

- The "(AI Estimated)" suffix helps users identify which foods came from the AI
- Each ingredient is a real food entry, so it can be favorited, reused, etc.
- The serving amount is set to the ingredient's quantity, so quantity in meal_items is always 1
- This makes the diary more flexible - users can adjust individual ingredients later
- The old Quick Add flow is completely bypassed for AI-estimated meals
- All existing flows (Add Food, My Meals, Barcode Scan, etc.) remain unchanged
