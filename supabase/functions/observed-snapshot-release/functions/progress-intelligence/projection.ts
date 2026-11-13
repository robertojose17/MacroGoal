import { GoalProjection, ProjectionBasis, WeightPace, GoalType } from './types.ts';
import { PROGRESS_CONFIG } from './config.ts';

export function computeProjection(
  currentWeightLbs: number | null,
  goalWeightLbs: number | null,
  weightPace: WeightPace,
  intendedLossRateLbsPerWeek: number | null,
  goalType: GoalType,
  todayStr: string,
): GoalProjection {
  const nullProjection: GoalProjection = {
    projectedGoalDate: null,
    projectedGoalDateRange: null,
    projectionBasis: 'none',
    projectionConfidence: null,
    weeksToGoal: null,
  };

  if (currentWeightLbs === null || goalWeightLbs === null) return nullProjection;
  if (goalType === 'gain' || goalType === 'maintain') return nullProjection;

  let usedPace: number;
  let basis: ProjectionBasis;

  if (weightPace.lbsPerWeek !== null && weightPace.confidence !== null) {
    usedPace = weightPace.lbsPerWeek;
    basis = 'observed';
  } else if (intendedLossRateLbsPerWeek !== null && intendedLossRateLbsPerWeek > 0) {
    usedPace = -intendedLossRateLbsPerWeek;
    basis = 'intended';
  } else {
    return nullProjection;
  }

  if (goalType === 'lose' && usedPace >= 0) return nullProjection;

  const absRemaining = Math.abs(goalWeightLbs - currentWeightLbs);
  const absPace = Math.abs(usedPace);
  if (absPace < 0.001) return nullProjection;

  const weeksToGoalRaw = absRemaining / absPace;
  const weeksToGoal = Math.round(weeksToGoalRaw * 2) / 2;

  const today = new Date(todayStr + 'T00:00:00Z');
  const centerDate = new Date(today);
  centerDate.setDate(today.getDate() + Math.round(weeksToGoal * 7));
  const projectedGoalDate = centerDate.toISOString().split('T')[0];

  const halfWidthFraction = PROGRESS_CONFIG.projectionRangeHalfWidthFraction;
  const halfWidthWeeks = Math.max(weeksToGoal * halfWidthFraction, 1.0);

  const earliestDate = new Date(today);
  earliestDate.setDate(today.getDate() + Math.round((weeksToGoal - halfWidthWeeks) * 7));
  const latestDate = new Date(today);
  latestDate.setDate(today.getDate() + Math.round((weeksToGoal + halfWidthWeeks) * 7));

  const projectionConfidence = (basis === 'observed' && weightPace.confidence !== null) ? 'medium' : 'low';

  return {
    projectedGoalDate,
    projectedGoalDateRange: {
      earliest: earliestDate.toISOString().split('T')[0],
      latest: latestDate.toISOString().split('T')[0],
      methodNote: 'heuristic_±15pct',
    },
    projectionBasis: basis,
    projectionConfidence,
    weeksToGoal,
  };
}
