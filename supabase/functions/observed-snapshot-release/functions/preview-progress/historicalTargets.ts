import { PROGRESS_CONFIG } from './config.ts';
import type { TdeeRowForHistory } from './accepted-goal-history.ts';
export { buildTargetTimeline, getTargetOnDate } from './accepted-goal-history.ts';
export type { GoalRowForHistory, TdeeRowForHistory } from './accepted-goal-history.ts';

export function hasTargetIntegrityConflict(
  activeGoalDailyCalories: number | null,
  tdeeEstimates: TdeeRowForHistory[],
  activeGoalCreatedAt?: string,
): boolean {
  if (!activeGoalDailyCalories) return false;
  const activeStart = activeGoalCreatedAt ? new Date(activeGoalCreatedAt).getTime() : -Infinity;
  const latestApplied = tdeeEstimates.find(t => t.adjustment_applied && t.prescribed_calories !== null && new Date(t.created_at).getTime() >= activeStart);
  if (!latestApplied) return false;
  const diff = Math.abs(activeGoalDailyCalories - Number(latestApplied.prescribed_calories));
  return diff > PROGRESS_CONFIG.targetIntegrityCheckKcal;
}
