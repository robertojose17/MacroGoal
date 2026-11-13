/** Pure accepted-goal history shared by the app and server; no platform/runtime imports. */
export type TargetConfidence = 'high' | 'medium' | 'none';
export interface TargetEvent {
  effectiveDate: string;
  sourceWeekStart: string | null;
  calorieTarget: number;
  proteinTarget: number | null;
  source: 'manual_goal' | 'adaptive_adjustment';
  confidence: TargetConfidence;
}
export interface DailyTargetResult {
  calorieTarget: number | null;
  proteinTarget: number | null;
  confidence: TargetConfidence;
  evaluable: boolean;
}

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

function acceptedInstant(timestamp: string): number {
  const instant = new Date(timestamp).getTime();
  if (!Number.isFinite(instant)) throw new Error('Invalid goal acceptance timestamp');
  return instant;
}

function acceptedLocalDate(timestamp: string, timezone: string): string {
  const instant = new Date(acceptedInstant(timestamp));
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function buildTargetTimeline(
  allGoals: GoalRowForHistory[],
  tdeeEstimates: TdeeRowForHistory[],
  timezone = 'UTC',
): TargetEvent[] {
  const events: { target: TargetEvent; acceptedAt: number }[] = [];
  const addEvent = (target: TargetEvent, timestamp: string) => events.push({ target, acceptedAt: acceptedInstant(timestamp) });
  const sortedGoals = [...allGoals].sort((a, b) => acceptedInstant(a.created_at) - acceptedInstant(b.created_at));
  const appliedInstants = new Set<number>();
  for (const adjustment of tdeeEstimates) {
    if (adjustment.adjustment_applied !== true) continue;
    const instant = acceptedInstant(adjustment.created_at);
    if (typeof adjustment.prescribed_calories !== 'number' || !Number.isFinite(adjustment.prescribed_calories) || adjustment.prescribed_calories <= 0
      || typeof adjustment.adjustment_amount !== 'number' || !Number.isFinite(adjustment.adjustment_amount)) {
      throw new Error('Invalid applied target adjustment');
    }
    if (appliedInstants.has(instant)) throw new Error('Ambiguous applied target adjustment');
    appliedInstants.add(instant);
  }

  for (let gi = 0; gi < sortedGoals.length; gi++) {
    const goal = sortedGoals[gi];
    const goalStartDate = acceptedLocalDate(goal.created_at, timezone);
    const goalAcceptedAt = acceptedInstant(goal.created_at);
    const nextGoalAcceptedAt = gi + 1 < sortedGoals.length
      ? acceptedInstant(sortedGoals[gi + 1].created_at) : null;
    if (nextGoalAcceptedAt === goalAcceptedAt) throw new Error('Ambiguous goal acceptance timestamp');

    const goalAdjustments = tdeeEstimates
      .filter(t => {
        if (t.adjustment_applied !== true) return false;
        const acceptedAt = acceptedInstant(t.created_at);
        if (acceptedAt < goalAcceptedAt) return false;
        if (nextGoalAcceptedAt !== null && acceptedAt >= nextGoalAcceptedAt) return false;
        return true;
      })
      .sort((a, b) => acceptedInstant(a.created_at) - acceptedInstant(b.created_at));

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

    addEvent({
      effectiveDate: goalStartDate,
      sourceWeekStart: null,
      calorieTarget: baseTarget,
      proteinTarget: goal.protein_g !== null ? Number(goal.protein_g) : null,
      source: 'manual_goal',
      confidence: baseConfidence,
    }, goal.created_at);

    for (const adj of goalAdjustments) {
      addEvent({
        effectiveDate: acceptedLocalDate(adj.created_at, timezone),
        sourceWeekStart: adj.week_start,
        calorieTarget: Math.round(Number(adj.prescribed_calories)),
        proteinTarget: goal.protein_g !== null ? Number(goal.protein_g) : null,
        source: 'adaptive_adjustment',
        confidence: 'medium',
      }, adj.created_at);
    }
  }

  // A day's final accepted event wins, including several changes on that day.
  return events.sort((a, b) => a.acceptedAt - b.acceptedAt).map(event => event.target);
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

