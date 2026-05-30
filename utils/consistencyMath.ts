
// ─── Consistency Score math helpers ──────────────────────────────────────────
// Single source of truth — imported by both ConsistencyScore.tsx and
// CompactConsistencyCard.tsx so the formula never drifts.

export type ScoreLabel = 'Locked In' | 'On Track' | 'Slipping';

export function calcCalorieScore(pct: number): number {
  if (pct >= 95 && pct <= 105) return 30;
  if (pct >= 85) return 24;
  if (pct >= 70) return 18;
  if (pct >= 50) return 12;
  return Math.min(6, (pct / 50) * 6);
}

export function calcProteinScore(pct: number): number {
  if (pct >= 95 && pct <= 105) return 20;
  if (pct >= 85) return 16;
  if (pct >= 70) return 12;
  if (pct >= 50) return 8;
  return Math.min(4, (pct / 50) * 4);
}

export function calcDailyScore(
  hasTracking: boolean,
  calories: number,
  calorieTarget: number,
  protein: number,
  proteinTarget: number,
): number {
  if (!hasTracking) return 0;

  const trackingPts = 50;

  const calPct = calorieTarget > 0 ? (calories / calorieTarget) * 100 : 0;
  const calPts = calcCalorieScore(calPct);

  const protPct = proteinTarget > 0 ? (protein / proteinTarget) * 100 : 0;
  const protPts = calcProteinScore(protPct);

  return trackingPts + calPts + protPts;
}

export function getLabel(score: number): ScoreLabel {
  if (score >= 80) return 'Locked In';
  if (score >= 60) return 'On Track';
  return 'Slipping';
}

export function getLabelColor(label: ScoreLabel): string {
  if (label === 'Locked In') return '#5CB97B';  // colors.success
  if (label === 'On Track') return '#F59E0B';
  return '#EF4444';                              // colors.error
}
