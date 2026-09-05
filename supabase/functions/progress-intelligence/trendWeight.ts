import { WeightDataPoint } from './weightSource.ts';
import { PROGRESS_CONFIG } from './config.ts';

export function computeTrendWeight(points: WeightDataPoint[]): number | null {
  const tau = PROGRESS_CONFIG.trendWeightTimeConstantDays;
  const minPoints = PROGRESS_CONFIG.trendWeightMinWeighIns;

  if (points.length < minPoints) return null;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let ema = sorted[0].weightLbs;

  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1].date + 'T00:00:00Z');
    const currDate = new Date(sorted[i].date + 'T00:00:00Z');
    const deltaDays = (currDate.getTime() - prevDate.getTime()) / 86400000;
    const safeDelta = Math.max(deltaDays, 0.001);
    const alpha = 1 - Math.exp(-safeDelta / tau);
    ema = alpha * sorted[i].weightLbs + (1 - alpha) * ema;
  }

  return Math.round(ema * 1000) / 1000;
}
