import { LoggingReliability, DataQualityFlag } from './types.ts';
import { PROGRESS_CONFIG } from './config.ts';

export interface DailyNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealTypeCount: number;
}

export interface LoggingReliabilityResult {
  loggingReliability: LoggingReliability;
  loggedDaysLast7: number;
  loggedDaysLast14: number;
  avgMealsPerLoggedDay: number | null;
  dataQualityFlags: DataQualityFlag[];
}

export function aggregateNutritionByDay(nutritionRaw: Array<{
  date: string;
  meal_type: string;
  meal_items: Array<{ calories: number; protein: number; carbs: number; fats: number }> | null;
}>): DailyNutrition[] {
  const byDate = new Map<string, { calories: number; protein: number; carbs: number; fats: number; mealTypes: Set<string> }>();

  for (const meal of nutritionRaw) {
    if (!meal.meal_items || meal.meal_items.length === 0) continue;
    const existing = byDate.get(meal.date) ?? { calories: 0, protein: 0, carbs: 0, fats: 0, mealTypes: new Set() };
    for (const item of meal.meal_items) {
      existing.calories += Number(item.calories) || 0;
      existing.protein += Number(item.protein) || 0;
      existing.carbs += Number(item.carbs) || 0;
      existing.fats += Number(item.fats) || 0;
    }
    if (meal.meal_type) existing.mealTypes.add(meal.meal_type);
    byDate.set(meal.date, existing);
  }

  return Array.from(byDate.entries()).map(([date, data]) => ({
    date,
    calories: Math.round(data.calories),
    protein: Math.round(data.protein * 10) / 10,
    carbs: Math.round(data.carbs * 10) / 10,
    fats: Math.round(data.fats * 10) / 10,
    mealTypeCount: data.mealTypes.size,
  }));
}

export function computeLoggingReliability(
  dailyNutrition: DailyNutrition[],
  todayStr: string,
): LoggingReliabilityResult {
  const flags: DataQualityFlag[] = [];

  const today = new Date(todayStr + 'T00:00:00Z');
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(today.getDate() - 7);
  const fourteenDaysAgo = new Date(today); fourteenDaysAgo.setDate(today.getDate() - 14);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

  const last7 = dailyNutrition.filter(d => d.date >= sevenDaysAgoStr && d.date <= todayStr);
  const last14 = dailyNutrition.filter(d => d.date >= fourteenDaysAgoStr && d.date <= todayStr);

  const loggedDaysLast7 = last7.length;
  const loggedDaysLast14 = last14.length;

  const avgMealsPerLoggedDay = loggedDaysLast7 > 0
    ? last7.reduce((sum, d) => sum + d.mealTypeCount, 0) / loggedDaysLast7
    : null;

  if (loggedDaysLast7 < PROGRESS_CONFIG.loggingMediumMinDaysLast7) {
    flags.push('LOW_LOGGING_FREQUENCY');
  }

  if (avgMealsPerLoggedDay !== null && avgMealsPerLoggedDay < PROGRESS_CONFIG.sparseMealDistributionThreshold) {
    flags.push('SPARSE_MEAL_DISTRIBUTION');
  }

  const hasVeryLowDay = last14.some(d => d.calories > 0 && d.calories < PROGRESS_CONFIG.veryLowCalorieThreshold);
  const hasVeryHighDay = last14.some(d => d.calories > PROGRESS_CONFIG.veryHighCalorieThreshold);

  if (hasVeryLowDay) flags.push('VERY_LOW_RECORDED_INTAKE');
  if (hasVeryHighDay) flags.push('VERY_HIGH_RECORDED_INTAKE');

  let loggingReliability: LoggingReliability;

  if (loggedDaysLast7 <= PROGRESS_CONFIG.loggingInsufficientMaxDaysLast7) {
    loggingReliability = 'insufficient';
  } else if (loggedDaysLast7 <= PROGRESS_CONFIG.loggingLowMaxDaysLast7) {
    loggingReliability = 'low';
  } else if (
    loggedDaysLast7 >= PROGRESS_CONFIG.loggingHighMinDaysLast7 &&
    avgMealsPerLoggedDay !== null &&
    avgMealsPerLoggedDay >= PROGRESS_CONFIG.loggingHighMinAvgMeals &&
    !hasVeryLowDay &&
    !hasVeryHighDay
  ) {
    loggingReliability = 'high';
  } else {
    loggingReliability = 'medium';
  }

  return {
    loggingReliability,
    loggedDaysLast7,
    loggedDaysLast14,
    avgMealsPerLoggedDay: avgMealsPerLoggedDay !== null ? Math.round(avgMealsPerLoggedDay * 100) / 100 : null,
    dataQualityFlags: flags,
  };
}
