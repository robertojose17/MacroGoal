export interface WeightDataPoint {
  date: string;
  weightLbs: number;
}

export interface WeightSourceResult {
  points: WeightDataPoint[];
  usedLegacyFallback: boolean;
}

export interface TrackerWeightRow {
  date: string;
  value: number;
}

export interface CheckInWeightRow {
  date: string;
  weight: number;
  updated_at: string;
}

export function resolveWeightSource(
  trackerWeights: TrackerWeightRow[],
  checkInWeights: CheckInWeightRow[],
  minPointsThreshold: number,
): WeightSourceResult {
  if (trackerWeights.length >= minPointsThreshold) {
    return {
      points: trackerWeights.map(r => ({
        date: r.date,
        weightLbs: Number(r.value),
      })).sort((a, b) => a.date.localeCompare(b.date)),
      usedLegacyFallback: false,
    };
  }

  const byDate = new Map<string, CheckInWeightRow>();
  for (const row of checkInWeights) {
    const existing = byDate.get(row.date);
    if (!existing || row.updated_at > existing.updated_at) {
      byDate.set(row.date, row);
    }
  }

  const legacyPoints: WeightDataPoint[] = Array.from(byDate.values())
    .map(r => ({
      date: r.date,
      weightLbs: Number(r.weight) * 2.20462,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (trackerWeights.length > 0) {
    const trackerDates = new Set(trackerWeights.map(r => r.date));
    const mergedLegacy = legacyPoints.filter(p => !trackerDates.has(p.date));
    const trackerPoints = trackerWeights.map(r => ({
      date: r.date,
      weightLbs: Number(r.value),
    }));
    const merged = [...trackerPoints, ...mergedLegacy]
      .sort((a, b) => a.date.localeCompare(b.date));
    return { points: merged, usedLegacyFallback: true };
  }

  return {
    points: legacyPoints,
    usedLegacyFallback: legacyPoints.length > 0,
  };
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + 'T00:00:00Z');
  const b = new Date(dateB + 'T00:00:00Z');
  return Math.abs((b.getTime() - a.getTime()) / 86400000);
}
