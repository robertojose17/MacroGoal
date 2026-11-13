import { ProgressState, AdaptiveAdjustmentRecord, DataQualityFlag, TargetEvent } from './types.ts';
import { UserProfile, GoalRow, TdeeEstimateRow } from './queries.ts';
import { WeightSourceResult } from './weightSource.ts';
import { WeightPace, TDEEEstimate, AdherenceResult, GoalProjection } from './types.ts';
import { LoggingReliabilityResult } from './loggingReliability.ts';
import { ProgressStatusResult } from './progressStatus.ts';
import { PROGRESS_CONFIG } from './config.ts';

export interface AssembleParams {
  userId: string;
  profile: UserProfile | null;
  activeGoal: GoalRow | null;
  weightSource: WeightSourceResult;
  trendWeightLbs: number | null;
  weightPace: WeightPace;
  loggingResult: LoggingReliabilityResult;
  adherence: AdherenceResult;
  tdee: TDEEEstimate;
  statusResult: ProgressStatusResult;
  projection: GoalProjection;
  tdeeEstimates: TdeeEstimateRow[];
  targetTimeline: TargetEvent[];
  hasTargetIntegrityConflict: boolean;
  todayStr: string;
  avgDailyCaloriesLogged: number | null;
  avgDailyProteinLogged: number | null;
}

export function assembleProgressState(params: AssembleParams): ProgressState {
  const {
    userId, profile, activeGoal, weightSource, trendWeightLbs, weightPace,
    loggingResult, adherence, tdee, statusResult, projection, tdeeEstimates,
    hasTargetIntegrityConflict, todayStr, avgDailyCaloriesLogged, avgDailyProteinLogged,
  } = params;

  const points = weightSource.points;
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  const thirtyDaysAgo = new Date(todayStr + 'T00:00:00Z');
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  const recentPoint = lastPoint && lastPoint.date >= thirtyDaysAgoStr ? lastPoint : null;
  const currentWeightLbs = recentPoint ? Math.round(recentPoint.weightLbs * 100) / 100 : null;

  let daysSinceLastWeighIn: number | null = null;
  let lastWeighInDate: string | null = null;
  if (lastPoint) {
    lastWeighInDate = lastPoint.date;
    const last = new Date(lastPoint.date + 'T00:00:00Z');
    const today = new Date(todayStr + 'T00:00:00Z');
    daysSinceLastWeighIn = Math.floor((today.getTime() - last.getTime()) / 86400000);
  }

  const goalType = (activeGoal?.goal_type as 'lose' | 'maintain' | 'gain' | null) ?? null;
  const gainGoalLimitedSupport = goalType === 'gain';
  const currentCalorieTarget = activeGoal?.daily_calories ? Math.round(Number(activeGoal.daily_calories)) : null;
  const baseCalorieTarget = activeGoal?.base_daily_calories ? Math.round(Number(activeGoal.base_daily_calories)) : null;
  const intendedLossRateLbsPerWeek = activeGoal?.loss_rate_lbs_per_week ? Number(activeGoal.loss_rate_lbs_per_week) : null;
  const currentProteinTarget = activeGoal?.protein_g ? Math.round(Number(activeGoal.protein_g)) : null;
  const goalWeightLbs = profile?.goal_weight ? Math.round(Number(profile.goal_weight) * 2.20462 * 100) / 100 : null;

  const journeyStartDate = profile?.journey_start_date ?? null;
  const journeyStartWeightLbs = profile?.journey_start_weight
    ? Math.round(Number(profile.journey_start_weight) * 2.20462 * 100) / 100
    : null;
  const totalWeightChangeLbs = (currentWeightLbs !== null && journeyStartWeightLbs !== null)
    ? Math.round((currentWeightLbs - journeyStartWeightLbs) * 100) / 100
    : null;

  let daysSinceJourneyStart: number | null = null;
  let dataWindowDays = 90;
  if (journeyStartDate) {
    const start = new Date(journeyStartDate + 'T00:00:00Z');
    const today = new Date(todayStr + 'T00:00:00Z');
    daysSinceJourneyStart = Math.floor((today.getTime() - start.getTime()) / 86400000);
    dataWindowDays = Math.max(daysSinceJourneyStart, 1);
  }

  let progressToGoalFraction: number | null = null;
  if (totalWeightChangeLbs !== null && journeyStartWeightLbs !== null && goalWeightLbs !== null) {
    const totalNeeded = Math.abs(journeyStartWeightLbs - goalWeightLbs);
    if (totalNeeded > 0) {
      progressToGoalFraction = Math.min(1, Math.max(0, Math.abs(totalWeightChangeLbs) / totalNeeded));
      progressToGoalFraction = Math.round(progressToGoalFraction * 1000) / 1000;
    }
  }

  const appliedAdjustments = tdeeEstimates
    .filter(t => t.adjustment_applied && t.prescribed_calories !== null)
    .sort((a, b) => b.week_start.localeCompare(a.week_start));

  const adaptiveHistory: AdaptiveAdjustmentRecord[] = appliedAdjustments.map(t => ({
    weekStart: t.week_start,
    effectiveDate: t.created_at.split('T')[0],
    adjustmentKcal: t.adjustment_amount ? Math.round(Number(t.adjustment_amount)) : 0,
    prescribedCalories: Math.round(Number(t.prescribed_calories)),
    avgCaloriesEaten: t.avg_calories_eaten ? Math.round(Number(t.avg_calories_eaten)) : 0,
    avgWeightLbs: t.avg_weight_lbs ? Math.round(Number(t.avg_weight_lbs) * 100) / 100 : 0,
    dataQualityDays: t.data_days_count ?? 0,
    skipReason: t.skip_reason,
    estimatedTdee: t.estimated_tdee ? Math.round(Number(t.estimated_tdee)) : null,
  }));

  const flags: DataQualityFlag[] = [...loggingResult.dataQualityFlags];

  if (weightSource.usedLegacyFallback) flags.push('LEGACY_WEIGHT_FALLBACK_USED');

  const sparseWindowCutoff = new Date(todayStr + 'T00:00:00Z');
  sparseWindowCutoff.setDate(sparseWindowCutoff.getDate() - PROGRESS_CONFIG.weightDataSparseWindowDays);
  const sparseWindowStr = sparseWindowCutoff.toISOString().split('T')[0];
  const recentWeighIns = points.filter(p => p.date >= sparseWindowStr);
  if (recentWeighIns.length < PROGRESS_CONFIG.weightDataSparseMinWeighIns) {
    flags.push('WEIGHT_DATA_SPARSE');
  }

  if (lastWeighInDate) {
    const staleThreshold = new Date(todayStr + 'T00:00:00Z');
    staleThreshold.setDate(staleThreshold.getDate() - PROGRESS_CONFIG.weightDataStaleThresholdDays);
    if (lastWeighInDate < staleThreshold.toISOString().split('T')[0]) {
      flags.push('WEIGHT_DATA_STALE');
    }
  } else {
    flags.push('WEIGHT_DATA_STALE');
  }

  if (hasTargetIntegrityConflict) flags.push('HISTORICAL_TARGET_UNCERTAINTY');

  return {
    userId,
    computedAt: new Date().toISOString(),
    dataWindowDays,
    goalType,
    gainGoalLimitedSupport,
    currentWeightLbs,
    trendWeightLbs,
    lastWeighInDate,
    daysSinceLastWeighIn,
    weightPace,
    currentCalorieTarget,
    baseCalorieTarget,
    intendedLossRateLbsPerWeek,
    tdee,
    avgDailyCaloriesLogged,
    avgDailyProteinLogged,
    currentProteinTarget,
    loggingReliability: loggingResult.loggingReliability,
    dataQualityFlags: [...new Set(flags)],
    loggedDaysLast7: loggingResult.loggedDaysLast7,
    loggedDaysLast14: loggingResult.loggedDaysLast14,
    avgMealsPerLoggedDay: loggingResult.avgMealsPerLoggedDay,
    adherence,
    progressStatus: statusResult.progressStatus,
    possiblePlateau: statusResult.possiblePlateau,
    lowLoggingReliability: loggingResult.loggingReliability === 'low' || loggingResult.loggingReliability === 'insufficient',
    goalWeightLbs,
    projection,
    journeyStartDate,
    journeyStartWeightLbs,
    totalWeightChangeLbs,
    daysSinceJourneyStart,
    progressToGoalFraction,
    lastAdaptiveAdjustment: adaptiveHistory.length > 0 ? adaptiveHistory[0] : null,
    adaptiveAdjustmentCount: appliedAdjustments.length,
    adaptiveHistory,
  };
}
