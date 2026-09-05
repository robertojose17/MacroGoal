import { AdherenceResult, TargetEvent, LoggingReliability } from './types.ts';
import { DailyNutrition } from './loggingReliability.ts';
import { getTargetOnDate } from './historicalTargets.ts';
import { PROGRESS_CONFIG } from './config.ts';

export function computeAdherence(
  dailyNutrition: DailyNutrition[],
  targetTimeline: TargetEvent[],
  loggingReliability: LoggingReliability,
  todayStr: string,
): AdherenceResult {
  const windowDays = PROGRESS_CONFIG.adherenceWindowDays;
  const calTol = PROGRESS_CONFIG.adherenceCalorieTolerance;
  const protTol = PROGRESS_CONFIG.adherenceProteinTolerance;
  const calWeight = PROGRESS_CONFIG.adherenceCalorieWeight;
  const protWeight = PROGRESS_CONFIG.adherenceProteinWeight;

  const nullResult: AdherenceResult = {
    score: null,
    adherenceDaysEvaluated: 0,
    coverageFraction: 0,
    windowDays,
    calorieAdherenceFraction: null,
    proteinAdherenceFraction: null,
  };

  if (loggingReliability === 'insufficient') return nullResult;

  const today = new Date(todayStr + 'T00:00:00Z');
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - windowDays);
  const windowStartStr = windowStart.toISOString().split('T')[0];

  const nutritionByDate = new Map<string, DailyNutrition>();
  for (const d of dailyNutrition) {
    if (d.date >= windowStartStr && d.date <= todayStr) {
      nutritionByDate.set(d.date, d);
    }
  }

  let daysEvaluated = 0;
  let totalScore = 0;
  let calorieAdherentDays = 0;
  let proteinAdherentDays = 0;
  let proteinEvaluableDays = 0;

  for (const [date, nutrition] of nutritionByDate) {
    const targetResult = getTargetOnDate(targetTimeline, date);
    if (!targetResult.evaluable || targetResult.calorieTarget === null) continue;

    daysEvaluated++;
    const calTarget = targetResult.calorieTarget;
    const protTarget = targetResult.proteinTarget;

    const calorieAdherent = (nutrition.calories >= calTarget * (1 - calTol) && nutrition.calories <= calTarget * (1 + calTol)) ? 1 : 0;
    calorieAdherentDays += calorieAdherent;

    let dayScore: number;
    if (protTarget !== null) {
      proteinEvaluableDays++;
      const proteinAdherent = nutrition.protein >= protTarget * (1 - protTol) ? 1 : 0;
      proteinAdherentDays += proteinAdherent;
      dayScore = calWeight * calorieAdherent + protWeight * proteinAdherent;
    } else {
      dayScore = calorieAdherent;
    }

    totalScore += dayScore;
  }

  if (daysEvaluated === 0) return nullResult;

  return {
    score: Math.round((totalScore / daysEvaluated) * 1000) / 1000,
    adherenceDaysEvaluated: daysEvaluated,
    coverageFraction: Math.round((daysEvaluated / windowDays) * 1000) / 1000,
    windowDays,
    calorieAdherenceFraction: Math.round((calorieAdherentDays / daysEvaluated) * 1000) / 1000,
    proteinAdherenceFraction: proteinEvaluableDays > 0
      ? Math.round((proteinAdherentDays / proteinEvaluableDays) * 1000) / 1000
      : null,
  };
}
