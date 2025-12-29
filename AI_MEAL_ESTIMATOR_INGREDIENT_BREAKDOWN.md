
# AI Meal Estimator - Ingredient Breakdown Feature

## Overview
The AI Meal Estimator has been enhanced to provide a detailed breakdown of individual ingredients with editable quantities and removal options, instead of just a single total for calories/macros.

## What Changed

### 1. Enhanced AI Prompt (chatbot.tsx)
- The system message now explicitly requests structured JSON output with ingredient-level data
- Format requested:
  ```json
  {
    "ingredients": [
      {
        "name": "ingredient name",
        "quantity": number,
        "unit": "g|oz|cup|tbsp|serving",
        "calories": number,
        "protein": number,
        "carbs": number,
        "fats": number,
        "fiber": number
      }
    ]
  }
  ```

### 2. Improved Response Parsing (chatbot.tsx)
- **Primary method**: Extracts JSON from markdown code blocks (```json...```)
- **Fallback method**: Searches for raw JSON objects in the response
- **Legacy fallback**: If no structured data is found, falls back to text-based parsing for single totals
- Creates a single "ingredient" representing the whole meal if only totals are found

### 3. New UI Components (chatbot.tsx)

#### Meal Totals Card
- Displays the sum of all included ingredients
- Shows: Total Calories, Protein, Carbs, Fats
- Updates dynamically when ingredients are edited or removed

#### Ingredients List
- One row per ingredient with:
  - Checkbox to include/exclude the ingredient
  - Ingredient name
  - Editable quantity input field
  - Unit display (g, oz, cup, etc.)
  - Macro breakdown (kcal, P, C, F)
- Visual feedback: Excluded ingredients appear at 50% opacity

### 4. Interactive Editing Features

#### Quantity Editing
- User can change the quantity of any ingredient
- Macros are automatically scaled proportionally
- Example: Changing "200g chicken" to "100g chicken" halves all macros
- Formula: `newMacro = (originalMacro / originalQuantity) * newQuantity`

#### Ingredient Removal
- Tap the checkbox to exclude/include an ingredient
- Excluded ingredients don't contribute to the meal totals
- Totals recalculate instantly

#### Dynamic Total Recalculation
- Totals update in real-time as you:
  - Change ingredient quantities
  - Include/exclude ingredients
- Only included ingredients contribute to the final totals

### 5. Logging Behavior (chatbot.tsx → quick-add.tsx)
- When "Log this meal" is tapped:
  - Validates that at least one ingredient is included
  - Passes the **edited totals** (not original AI estimates) to quick-add
  - Quick-add creates the diary entry with the updated values
- The existing diary logging flow remains unchanged

## Error Handling

### AI Response Parsing Failures
- If JSON parsing fails, the system falls back to text-based parsing
- If text parsing also fails, no estimate is shown (no crash)
- User can send another message to try again

### Validation
- Quantity changes are validated (must be a positive number)
- At least one ingredient must be included before logging
- Alert shown if user tries to log with no ingredients

## Backward Compatibility

### Existing Flows Preserved
- All non-AI flows remain untouched:
  - Food Library search
  - Barcode scanning
  - My Meals
  - Quick Add (direct)
  - Copy From Previous
  - Favorites and Recent Foods
- The AI Estimator can still handle single-total responses (legacy fallback)

### Edge Function
- The chatbot Edge Function remains generic (no changes needed)
- It simply passes messages to OpenRouter and returns the response
- All parsing logic is client-side for flexibility

## Testing Checklist

### Basic Flow
- [x] Open Add Food → AI Meal Estimator
- [x] Describe a meal (e.g., "Chipotle bowl with chicken, no rice")
- [x] Verify AI returns ingredient breakdown
- [x] Check that totals match the sum of ingredients

### Editing Features
- [x] Change an ingredient quantity
- [x] Verify macros scale proportionally
- [x] Verify totals update correctly
- [x] Exclude an ingredient
- [x] Verify totals recalculate without that ingredient
- [x] Re-include the ingredient
- [x] Verify totals update again

### Logging
- [x] Edit ingredients and quantities
- [x] Tap "Log this meal"
- [x] Verify navigation to quick-add with correct totals
- [x] Verify diary entry is created with edited values
- [x] Check that the logged meal shows correct macros in the diary

### Error Cases
- [x] Try to log with all ingredients excluded → Alert shown
- [x] Enter invalid quantity (negative, text) → Ignored/validated
- [x] AI returns non-JSON response → Falls back to text parsing
- [x] AI returns no macros → No estimate shown, no crash

### Existing Flows (Regression Testing)
- [x] Food Library search still works
- [x] Barcode scan still works
- [x] My Meals create/edit/log still works
- [x] Quick Add (direct) still works
- [x] Copy From Previous still works
- [x] Home dashboard still works
- [x] Profile/goals still work

## Technical Details

### State Management
- `latestEstimate`: Holds the current estimate with ingredients array
- Each ingredient has a unique `id` for React key and editing
- `included` boolean flag controls whether ingredient contributes to totals

### Performance
- Quantity changes trigger immediate recalculation (no debouncing needed)
- Calculations are simple arithmetic, no performance concerns
- ScrollView is appropriate (ingredient lists are typically small)

### Styling
- Consistent with existing app design (colors, spacing, typography)
- Dark mode fully supported
- Responsive layout works on all screen sizes
- Proper keyboard handling with KeyboardAvoidingView

## Future Enhancements (Optional)

### Potential Improvements
1. **Photo Analysis**: Add image upload to estimate from photos
2. **Ingredient Database**: Link ingredients to food database for more accurate macros
3. **Serving Size Presets**: Quick buttons for common multipliers (0.5x, 2x, etc.)
4. **Save as My Meal**: Option to save the ingredient list as a reusable meal
5. **Nutrition Facts**: Show additional nutrients (sodium, sugar, vitamins)
6. **AI Refinement**: Allow user to ask follow-up questions to refine estimates

### Known Limitations
1. AI accuracy depends on the quality of the user's description
2. Ingredient quantities are estimates, not precise measurements
3. No photo analysis yet (text-only input)
4. No ingredient substitution suggestions

## Summary

The AI Meal Estimator now provides:
- ✅ Ingredient-level breakdown with individual macros
- ✅ Editable quantities with automatic macro scaling
- ✅ Ingredient removal/inclusion toggle
- ✅ Dynamic total recalculation
- ✅ Logging with edited totals
- ✅ Graceful fallback for non-structured responses
- ✅ Full backward compatibility with existing flows
- ✅ No breaking changes to other features

All existing functionality remains intact. The enhancement is purely additive.
