import { TargetEvent, DailyTargetResult, TargetConfidence } from './types.ts';
import { PROGRESS_CONFIG } from './config.ts';

export interface GoalRowForHistory {
  id: string;
  daily_calories: number | null;
  protein_g: number | null;
  base_daily_calories: number | null;
  created_at: string;
  is_active: boolean;
}

export interface TdeeRowForHistory {
  id: string;
  week_start: string;
  created_at: string;
  prescribed_calories: number | null;
  adjustment_amount: number | null;
  adjustment_applied: boolean;
  skip_reason: string | null;
}

export function buildTargetTimeline(
  allGoals: GoalRowForHistory[],
  tdeeEstimates: TdeeRowForHistory[],
): TargetEvent[] {
  const events: TargetEvent[] = [];
  const sortedGoals = [...allGoals].sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (let gi = 0; gi < sortedGoals.length; gi++) {
    const goal = sortedGoals[gi];
    const goalStartDate = goal.created_at.split('T')[0];
    const nextGoalStartDate = gi + 1 < sortedGoals.length
      ? sortedGoals[gi + 1].created_at.split('T')[0]
      : null;

    const goalAdjustments = tdeeEstimates
      .filter(t => {
        if (!t.adjustment_applied || t.adjustment_amount === null || t.prescribed_calories === null) return false;
        const effectiveDate = t.created_at.split('T')[0];
        if (effectiveDate < goalStartDate) return false;
        if (nextGoalStartDate && effectiveDate >= nextGoalStartDate) return false;
        return true;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    let baseTarget: number;
    let baseConfidence: TargetConfidence;

    if (goal.base_daily_calories !== null && goal.base_daily_calories !== undefined) {
      baseTarget = Number(goal.base_daily_calories);
      baseConfidence = 'high';
    } else if (goalAdjustments.length > 0) {
      const first = goalAdjustments[0];
      baseTarget = Math.round(Number(first.prescribed_calories) - Number(first.adjustment_amount));
      baseConfidence = 'medium';
    } else {
      baseTarget = Number(goal.daily_calories ?? 0);
      baseConfidence = 'high';
    }

    events.push({
      effectiveDate: goalStartDate,
      sourceWeekStart: null,
      calorieTarget: baseTarget,
      proteinTarget: goal.protein_g !== null ? Number(goal.protein_g) : null,
      source: 'manual_goal',
      confidence: baseConfidence,
    });

    for (const adj of goalAdjustments) {
      events.push({
        effectiveDate: adj.created_at.split('T')[0],
        sourceWeekStart: adj.week_start,
        calorieTarget: Math.round(Number(adj.prescribed_calories)),
        proteinTarget: goal.protein_g !== null ? Number(goal.protein_g) : null,
        source: 'adaptive_adjustment',
        confidence: 'medium',
      });
    }
  }

  return events.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

export function getTargetOnDate(timeline: TargetEvent[], date: string): DailyTargetResult {
  if (timeline.length === 0) {
    return { calorieTarget: null, proteinTarget: null, confidence: 'none', evaluable: false };
  }

  let applicable: TargetEvent | null = null;
  for (const event of timeline) {
    if (event.effectiveDate <= date) {
      applicable = event;
    } else {
      break;
    }
  }

  if (!applicable) {
    return { calorieTarget: null, proteinTarget: null, confidence: 'none', evaluable: false };
  }

  return {
    calorieTarget: applicable.calorieTarget,
    proteinTarget: applicable.proteinTarget,
    confidence: applicable.confidence,
    evaluable: true,
  };
}

export function hasTargetIntegrityConflict(
  activeGoalDailyCalories: number | null,
  tdeeEstimates: TdeeRowForHistory[],
): boolean {
  if (!activeGoalDailyCalories) return false;
  const latestApplied = tdeeEstimates.find(t => t.adjustment_applied && t.prescribed_calories !== null);
  if (!latestApplied) return false;
  const diff = Math.abs(activeGoalDailyCalories - Number(latestApplied.prescribed_calories));
  return diff > PROGRESS_CONFIG.targetIntegrityCheckKcal;
}
