import { ProgressStatus, WeightPace, GoalType } from './types.ts';
import { WeightDataPoint } from './weightSource.ts';
import { computeWeightPace } from './weightPace.ts';
import { PROGRESS_CONFIG } from './config.ts';

export interface ProgressStatusResult {
  progressStatus: ProgressStatus;
  possiblePlateau: boolean;
}

export function computeProgressStatus(
  weightPace: WeightPace,
  goalType: GoalType,
  currentWeightLbs: number | null,
  goalWeightLbs: number | null,
  currentCalorieTarget: number | null,
  intendedLossRateLbsPerWeek: number | null,
  allWeightPoints: WeightDataPoint[],
  todayStr: string,
  daysSinceJourneyStart: number | null,
): ProgressStatusResult {
  const stable = PROGRESS_CONFIG.weightStableThresholdLbsPerWeek;
  const maintaining = PROGRESS_CONFIG.maintainingThresholdLbsPerWeek;
  const onTrackLow = PROGRESS_CONFIG.onTrackLowerFraction;
  const onTrackHigh = PROGRESS_CONFIG.onTrackUpperFraction;

  if (weightPace.lbsPerWeek === null || currentCalorieTarget === null || currentWeightLbs === null) {
    return { progressStatus: 'INSUFFICIENT_DATA', possiblePlateau: false };
  }

  const pace = weightPace.lbsPerWeek;

  if (goalWeightLbs !== null) {
    if (goalType === 'lose' && currentWeightLbs <= goalWeightLbs) {
      return { progressStatus: 'GOAL_REACHED', possiblePlateau: false };
    }
    if (goalType === 'gain' && currentWeightLbs >= goalWeightLbs) {
      return { progressStatus: 'GOAL_REACHED', possiblePlateau: false };
    }
  }

  if (goalType === 'gain') {
    return { progressStatus: 'INSUFFICIENT_DATA', possiblePlateau: false };
  }

  if (goalType === 'maintain' || intendedLossRateLbsPerWeek === 0) {
    if (Math.abs(pace) <= maintaining) return { progressStatus: 'MAINTAINING', possiblePlateau: false };
    if (pace < -maintaining) return { progressStatus: 'BELOW_TARGET_PACE', possiblePlateau: false };
    return { progressStatus: 'TRENDING_UP', possiblePlateau: false };
  }

  if (Math.abs(pace) <= stable) {
    const possiblePlateau = checkPossiblePlateau(allWeightPoints, todayStr, daysSinceJourneyStart, goalType);
    return { progressStatus: 'WEIGHT_STABLE', possiblePlateau };
  }

  if (pace > stable) {
    return { progressStatus: 'TRENDING_UP', possiblePlateau: false };
  }

  const intendedRate = intendedLossRateLbsPerWeek ?? 1.0;

  if (pace < -(intendedRate * onTrackHigh)) {
    return { progressStatus: 'ABOVE_TARGET_PACE', possiblePlateau: false };
  }

  if (pace <= -(intendedRate * onTrackLow)) {
    return { progressStatus: 'ON_TRACK', possiblePlateau: false };
  }

  return { progressStatus: 'BELOW_TARGET_PACE', possiblePlateau: false };
}

function checkPossiblePlateau(
  allWeightPoints: WeightDataPoint[],
  todayStr: string,
  daysSinceJourneyStart: number | null,
  goalType: GoalType,
): boolean {
  if (goalType !== 'lose') return false;
  const plateauMinDays = PROGRESS_CONFIG.plateauMinDays;
  if (daysSinceJourneyStart === null || daysSinceJourneyStart < plateauMinDays) return false;

  const cutoff = new Date(todayStr + 'T00:00:00Z');
  cutoff.setDate(cutoff.getDate() - plateauMinDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const recentPoints = allWeightPoints.filter(p => p.date >= cutoffStr);

  if (recentPoints.length < PROGRESS_CONFIG.paceMinWeighIns) return false;

  const recentPace = computeWeightPace(recentPoints, todayStr);
  if (recentPace.lbsPerWeek === null) return false;

  return Math.abs(recentPace.lbsPerWeek) <= PROGRESS_CONFIG.weightStableThresholdLbsPerWeek;
}
