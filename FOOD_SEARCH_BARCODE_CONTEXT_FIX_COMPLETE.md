
# Food Search & Barcode Context Fix - Complete

## Summary
Fixed two critical bugs related to food search and barcode scanning in the My Meal builder flow.

## Bug #1: Food Search Inside My Meals Not Working ✅

### Problem
- Food search inside "Create My Meal" wasn't returning results
- Foods weren't being added to the My Meal draft
- The My Meal builder couldn't pull foods

### Root Cause
- The mode parameter was set to `"mymeal"` instead of `"my_meal_builder"`
- Context wasn't being passed through the navigation chain
- Food selection handlers were checking for wrong mode values

### Solution
1. **Updated My Meal Builder** (`app/my-meal-builder.tsx`):
   - Changed mode from `"mymeal"` to `"my_meal_builder"`
   - Added `context: 'my_meal_builder'` parameter

2. **Updated Add Food Screen** (`app/add-food.tsx`):
   - Added `context` parameter extraction
   - Updated all navigation calls to pass `context`
   - Changed mode checks from `mode === 'mymeal'` to `mode === 'my_meal_builder' || context === 'my_meal_builder'`
   - Updated header title logic to check both mode and context

3. **Updated Food Search** (`app/food-search.tsx`):
   - Added `context` parameter extraction
   - Updated `handleSelectProduct` to pass context to Food Details

### Acceptance Test
✅ Search "chicken" inside Create My Meal → results appear → tap item → it appears inside My Meal list

---

## Bug #2: Barcode Scan Shows "Add to Breakfast" in My Meal Context ❌→✅

### Problem
- When scanning a barcode from "Create My Meal", it showed "Add to Breakfast"
- The food was being logged to a meal instead of added to the My Meal draft
- Context wasn't being detected properly

### Root Cause
- Context parameter wasn't being passed through the barcode scanner flow
- Food Details screen wasn't receiving or using the context parameter
- Button text logic didn't check for `my_meal_builder` context

### Solution
1. **Updated Barcode Scanner** (`app/barcode-scanner.tsx`):
   - Added `context` and `returnTo` parameter extraction
   - Updated all navigation calls to pass context
   - Added logging to track context flow

2. **Updated Food Details Screen** (`app/food-details.tsx`):
   - Added `context` parameter extraction
   - Passed context to `FoodDetailsLayout` component

3. **Updated Food Details Layout** (`components/FoodDetailsLayout.tsx`):
   - Added `context` prop to interface
   - Updated button text logic to check context:
     ```typescript
     if (mode === 'edit') {
       buttonText = 'Save Changes';
     } else if (context === 'my_meal_builder') {
       buttonText = 'Add to My Meal';
     } else {
       buttonText = `Add to ${mealLabels[mealType]}`;
     }
     ```
   - Updated save handler to check context for routing:
     ```typescript
     if (context === 'my_meal_builder' || returnTo === '/my-meal-builder' || myMealId) {
       // Return to My Meal builder with new food item
     } else {
       // Log to diary
     }
     ```

4. **Updated AI Meal Estimator** (`app/chatbot.tsx`):
   - Added `context` parameter extraction
   - Ensured context is passed through the flow

### Acceptance Tests
✅ Create My Meal → Search food → adds into My Meal list
✅ Create My Meal → Barcode scan → shows "Add to My Meal" → adds into My Meal list
✅ Breakfast Add Food → Barcode scan → shows "Add to Breakfast" → logs into Breakfast

---

## Implementation Details

### Context Parameter Flow
The `context` parameter now flows through the entire navigation chain:

1. **My Meal Builder** → Add Food:
   ```typescript
   context: 'my_meal_builder'
   ```

2. **Add Food** → Barcode Scanner / Food Search / AI Estimator:
   ```typescript
   context: context  // Pass through
   ```

3. **Barcode Scanner / Food Search** → Food Details:
   ```typescript
   context: context  // Pass through
   ```

4. **Food Details** → Decision:
   - If `context === 'my_meal_builder'`: Add to My Meal draft
   - Else: Log to diary

### Mode vs Context
- **mode**: Indicates the general flow type (`"diary"`, `"my_meal_builder"`)
- **context**: Explicitly indicates the calling context (`"meal_log"`, `"my_meal_builder"`)
- Both are checked for maximum compatibility

### Button Text Logic
The button text in Food Details now correctly shows:
- **"Save Changes"** when editing an existing food
- **"Add to My Meal"** when context is `my_meal_builder`
- **"Add to Breakfast/Lunch/Dinner"** when logging to diary

---

## Files Modified

1. `app/my-meal-builder.tsx` - Changed mode parameter
2. `app/add-food.tsx` - Added context handling throughout
3. `app/food-search.tsx` - Added context parameter
4. `app/barcode-scanner.tsx` - Added context and returnTo parameters
5. `app/food-details.tsx` - Added context parameter
6. `components/FoodDetailsLayout.tsx` - Added context prop and logic
7. `app/chatbot.tsx` - Added context parameter

---

## Testing Checklist

### My Meal Builder Flow
- [x] Create My Meal → Add Food → Search "chicken" → Results appear
- [x] Create My Meal → Add Food → Select food → Food added to My Meal list
- [x] Create My Meal → Add Food → Barcode scan → Shows "Add to My Meal"
- [x] Create My Meal → Add Food → Barcode scan → Food added to My Meal list
- [x] Create My Meal → Add Food → AI Estimator → Food added to My Meal list

### Normal Diary Flow
- [x] Breakfast → Add Food → Search → Shows "Add to Breakfast"
- [x] Breakfast → Add Food → Barcode scan → Shows "Add to Breakfast"
- [x] Breakfast → Add Food → Select food → Logs to Breakfast

### Edge Cases
- [x] Context parameter is optional (defaults to diary flow)
- [x] Both mode and context are checked for compatibility
- [x] returnTo parameter is respected

---

## Status: ✅ COMPLETE

Both bugs have been fixed and tested. The food search and barcode scanner now correctly detect the context and behave appropriately:

1. **In My Meal Builder**: Foods are added to the My Meal draft
2. **In Diary Flow**: Foods are logged to the selected meal

The implementation uses a consistent `context` parameter throughout the navigation chain to ensure proper behavior in all scenarios.
