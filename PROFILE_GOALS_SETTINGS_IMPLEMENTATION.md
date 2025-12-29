
# Profile Goals Settings Implementation - Complete ✅

## Overview
Successfully implemented a unified "Calorie & Goals Settings" section on the Profile screen that allows users to edit all calorie-relevant fields in one place, with automatic recalculation of daily calories and macros. Also added a "Start Date" field for tracking the user's journey.

## Database Changes

### 1. Added `start_date` column to `goals` table
```sql
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE;
```
- Type: `DATE`
- Optional: Can be `NULL`
- Purpose: Track when the user started their fitness journey

### 2. Added `goal_weight` column to `users` table
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS goal_weight NUMERIC;
```
- Type: `NUMERIC`
- Optional: Can be `NULL`
- Purpose: Store the user's target weight (stored in kg, displayed in user's preferred units)

## Profile Screen Changes

### New "Calorie & Goals Settings" Section
The Profile screen now includes a comprehensive, editable section that groups all calorie-relevant settings:

#### Editable Fields:
1. **Height** - Tap to edit (supports both metric cm and imperial feet/inches)
2. **Current Weight** - Tap to edit (supports both kg and lbs)
3. **Goal Weight** - Tap to edit (optional field)
4. **Age** - Tap to edit (calculates and updates date_of_birth)
5. **Sex** - Tap to select from Male/Female via Alert dialog
6. **Activity Level** - Tap to select from Sedentary/Light/Moderate/Very Active via Alert dialog
7. **Weight Loss Rate** - Tap to edit (only shown for "lose weight" goal type)

#### Features:
- **Inline Editing**: Each field is tappable and opens an edit modal or picker
- **Automatic Recalculation**: When any field is saved, the app:
  - Recalculates BMR using the Mifflin-St Jeor equation
  - Recalculates TDEE based on activity level
  - Recalculates target calories based on goal type and loss rate
  - Recalculates macros using the balanced preset
  - Creates a new active goal with updated values
  - Deactivates the old goal
- **Unit Conversion**: Automatically converts between metric and imperial based on user preference
- **Current Daily Targets Display**: Shows calculated calories, protein, carbs, and fats in a compact row

### Start Date Feature
- **Location**: Displayed at the bottom of the "Calorie & Goals Settings" section
- **UI**: Shows "Journey Start Date" with current date or "Set Date" button
- **Date Picker**:
  - iOS: Modal with spinner-style picker and Cancel/Done buttons
  - Android: Native date picker dialog
- **Maximum Date**: Today (cannot set future dates)
- **Storage**: Saved to `goals.start_date` column
- **Purpose**: Allows users to track progress from a specific starting point

### Advanced Settings Link
- Added "Advanced" link in the section header
- Opens the existing `edit-goals.tsx` screen for:
  - Changing goal type (lose/maintain/gain)
  - Adjusting macro presets (balanced/high protein/low carb/keto/custom)
  - Fine-tuning custom macro percentages

## User Experience Flow

### Editing a Field:
1. User taps on any editable field (e.g., "Height")
2. Modal opens with current value pre-filled
3. User enters new value
4. User taps "Save"
5. App shows loading indicator
6. App recalculates all goals automatically
7. Modal closes and Profile screen refreshes with new values
8. Daily calories and macros update immediately

### Setting Start Date:
1. User taps "Set Date" or current date in Start Date section
2. Date picker appears (modal on iOS, dialog on Android)
3. User selects desired start date
4. On iOS: User taps "Done"
5. On Android: Date saves immediately
6. Start date updates in the database and UI

## Technical Implementation

### State Management:
- `editingField`: Tracks which field is currently being edited
- `editValue` & `editValue2`: Store temporary input values
- `saving`: Loading state during save operations
- `showDatePicker` & `selectedDate`: Date picker state

### Key Functions:
- `openEditModal(field)`: Opens edit modal with pre-filled values
- `saveEditedField()`: Validates, converts units, saves to database, triggers recalculation
- `recalculateGoals(updatedUser, updatedGoal)`: Core calculation logic
- `handleStartDateChange()`: Handles date picker changes
- `saveStartDate(date)`: Saves start date to database

### Calculation Flow:
```
User Input → Unit Conversion → Database Update → 
BMR Calculation → TDEE Calculation → Target Calories → 
Macro Calculation → New Goal Creation → UI Refresh
```

### Unit Handling:
- All values stored in metric (kg, cm) in database
- Conversion happens at UI layer based on `preferred_units`
- Imperial: lbs, feet/inches
- Metric: kg, cm

## Constraints Maintained

✅ **No formula changes**: Uses existing calculation functions from `utils/calculations.ts`
✅ **No breaking changes**: All existing flows (navigation, subscriptions, AI estimator, barcode scanner, My Meals) remain intact
✅ **Consistent styling**: Reuses existing styles from Profile screen
✅ **Safe null handling**: All new fields handle null values gracefully
✅ **RLS policies**: Existing RLS policies on `users` and `goals` tables apply to new columns

## Files Modified

1. **app/(tabs)/profile.tsx** - Complete rewrite with new editable settings section
2. **types/index.ts** - Added `goal_weight` to User interface, `start_date` to Goal interface
3. **Database migrations**:
   - `add_start_date_to_goals` - Added start_date column
   - `add_goal_weight_to_users` - Added goal_weight column

## Testing Checklist

- [x] Height editing (metric and imperial)
- [x] Weight editing (metric and imperial)
- [x] Goal weight editing
- [x] Age editing
- [x] Sex selection
- [x] Activity level selection
- [x] Weight loss rate editing
- [x] Start date picker (iOS and Android)
- [x] Automatic goal recalculation
- [x] Unit conversion accuracy
- [x] Modal interactions
- [x] Loading states
- [x] Error handling
- [x] Database updates
- [x] UI refresh after save

## Future Enhancements

Potential improvements for later:
- Add goal weight progress tracking
- Use start_date for analytics and progress charts
- Add "days since start" counter
- Show weight loss/gain rate based on start date
- Add milestone celebrations based on start date
- Export data from start date onwards

## Notes

- The "Advanced" link still opens the existing `edit-goals.tsx` screen for users who want to change goal type or macro presets
- The old "Edit Goals" button behavior is preserved for users who haven't completed onboarding
- All calculations use the existing formulas - no changes to the math
- The implementation is fully backward compatible with existing user data
