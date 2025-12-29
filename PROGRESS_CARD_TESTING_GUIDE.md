
# Progress Card Testing Guide

## Quick Test Checklist

### 1. Visual Verification
Open the Dashboard and check the Progress card:

- [ ] Card loads without errors
- [ ] Green "Planned" line is visible
- [ ] White "Actual" line is visible with dots at check-in points
- [ ] Y-axis shows weight values in lbs (e.g., 175, 180, 185, 190)
- [ ] X-axis shows dates in MM/DD format
- [ ] Legend shows "Planned" (green) and "Actual" (white)

### 2. Zoom Controls Test
Click each time range button and verify:

- [ ] **1W**: Shows last 7 days, daily labels
- [ ] **1M**: Shows last 30 days, labels every 3 days
- [ ] **6M**: Shows last 180 days, labels every 2 weeks
- [ ] **1Y**: Shows last 365 days, labels every month
- [ ] **All**: Shows from plan start date to today

For each zoom level:
- [ ] Chart updates smoothly
- [ ] Y-axis adjusts to fit visible data
- [ ] No NaN or undefined values appear
- [ ] Chart remains readable

### 3. Data Accuracy Test
With the test data (starting ~189 lbs, goal ~175 lbs):

- [ ] Planned line starts at ~189 lbs
- [ ] Planned line ends at ~175 lbs
- [ ] Planned line is a straight diagonal (not curved or stepped)
- [ ] Actual line shows weight decreasing over time
- [ ] Actual line has 13 visible points (check-ins)
- [ ] Actual line follows a realistic weight loss pattern

### 4. Console Logs Test
Open browser/device console and check for:

```
[Progress] Loading data for user: <user-id>
[Progress] userData: { starting_weight, goal_weight, weight_unit }
[Progress] goalData: { start_date, loss_rate_lbs_per_week }
[Progress] weight_unit from profile: kg
[Progress] startWeight (lbs): ~189
[Progress] goalWeight (lbs): ~175
[Progress] Check-ins loaded: 13
[Progress] Check-ins data: [array of check-ins]
[Progress] Preparing chart data for range: <start> to <end>
[Progress] Planned goal date: <date> in <days> days
[Progress] Total dates in range: <number>
[Progress] Planned weights (first 5): [array]
[Progress] Actual weights (first 5): [array]
[Progress] Y-axis range: <min> to <max> lbs
[Progress] Datasets created: 2
[Progress] Has planned data: true
[Progress] Has actual data: true
```

### 5. Edge Cases Test

#### Test: User with no check-ins
1. Delete all check-ins for a test user
2. Verify: Only green planned line shows
3. Verify: No errors in console

#### Test: User with no goal set
1. Set goal_weight to null
2. Verify: Shows placeholder "Set your weight goal in Profile to see progress."
3. Verify: No chart is rendered

#### Test: User with starting_weight = null
1. Set starting_weight to null
2. Verify: Falls back to current_weight
3. Verify: Chart still renders correctly

### 6. Performance Test
- [ ] Chart loads within 2 seconds
- [ ] Zoom changes are instant (< 500ms)
- [ ] No lag when scrolling horizontally
- [ ] No memory leaks (check with React DevTools)

### 7. Cross-Platform Test
Test on:
- [ ] iOS device/simulator
- [ ] Android device/emulator
- [ ] Web browser (if applicable)

### 8. Dark Mode Test
- [ ] Switch to dark mode
- [ ] Verify chart background is dark
- [ ] Verify text is readable (light color)
- [ ] Verify lines are visible against dark background

## Expected Results

### With Test Data
- **Start Weight**: 189.6 lbs (86.0 kg)
- **Goal Weight**: 175.0 lbs (79.4 kg)
- **Loss Rate**: 1 lb/week
- **Start Date**: 2025-12-01
- **Check-ins**: 13 entries from 2025-11-25 to 2025-12-29

### Planned Line
- Should show a straight diagonal from 189.6 lbs to 175.0 lbs
- Goal date should be ~14 weeks from start (14.6 lbs to lose at 1 lb/week)
- Line should extend beyond current date if goal not yet reached

### Actual Line
- Should show gradual weight loss from 189.6 lbs to 179.5 lbs
- Should have 13 visible dots (one per check-in)
- Should be below planned line (losing faster than planned)

## Troubleshooting

### Chart not showing
1. Check console for errors
2. Verify profile data is loaded (check logs)
3. Verify check-ins exist in database
4. Verify goal_weight and starting_weight are not null

### NaN values on Y-axis
1. Check weight unit conversion (kg to lbs)
2. Verify all weights are valid numbers
3. Check Y-axis range calculation

### Lines not visible
1. Check dataset colors (green and white)
2. Verify data arrays have valid values
3. Check if data is within Y-axis range

### Zoom not working
1. Verify time range state is updating
2. Check date range calculation
3. Verify chart re-renders on state change

## Success Criteria

The Progress card is working correctly if:
1. ✅ Chart renders without errors
2. ✅ Green planned line is a straight diagonal
3. ✅ White actual line connects check-in points
4. ✅ Y-axis shows lbs values (no NaN)
5. ✅ X-axis shows dates (no empty labels)
6. ✅ Zoom controls change visible date range
7. ✅ Console logs show valid data
8. ✅ No runtime errors or warnings
9. ✅ Works in both light and dark mode
10. ✅ Other dashboard features still work

## Test User Data

If you need to create a test user with realistic data:

```sql
-- Set up test user profile
UPDATE users 
SET 
  starting_weight = 86.0,  -- kg
  current_weight = 81.4,   -- kg
  goal_weight = 79.4,      -- kg
  weight_unit = 'kg'
WHERE id = '<user-id>';

-- Set up test goal
UPDATE goals 
SET 
  start_date = '2025-11-25',
  loss_rate_lbs_per_week = 1.0,
  is_active = true
WHERE user_id = '<user-id>';

-- Add test check-ins (see PROGRESS_CARD_FIX_COMPLETE.md for full list)
```
