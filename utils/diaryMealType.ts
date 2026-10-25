export type DiaryMealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Matches the existing Home add-food hour mapping for internal meal_type compatibility. */
export function diaryMealTypeForLocalTime(at: Date = new Date()): DiaryMealSlot {
  const hour = at.getHours();
  if (hour >= 6 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'snack';
}
