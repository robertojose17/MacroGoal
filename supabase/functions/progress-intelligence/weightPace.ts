import { WeightDataPoint, daysBetween } from './weightSource.ts';
import { WeightPace, PaceConfidence } from './types.ts';
import { PROGRESS_CONFIG } from './config.ts';

export function computeWeightPace(points: WeightDataPoint[], todayStr: string): WeightPace {
  const halfLife = PROGRESS_CONFIG.paceHalfLifeDays;
  const windowDays = PROGRESS_CONFIG.paceWindowDays;
  const minWeighIns = PROGRESS_CONFIG.paceMinWeighIns;
  const minSpanDays = PROGRESS_CONFIG.paceMinSpanDays;
  const highMinWeighIns = PROGRESS_CONFIG.paceHighConfidenceMinWeighIns;
  const highMinSpanDays = PROGRESS_CONFIG.paceHighConfidenceMinSpanDays;

  const cutoff = new Date(todayStr + 'T00:00:00Z');
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const windowPoints = points.filter(p => p.date >= cutoffStr);

  const nullResult: WeightPace = {
    lbsPerWeek: null,
    confidence: null,
    weeksOfData: 0,
    weighInCount: windowPoints.length,
  };

  if (windowPoints.length < minWeighIns) return nullResult;

  const sorted = [...windowPoints].sort((a, b) => a.date.localeCompare(b.date));
  const span = daysBetween(sorted[0].date, sorted[sorted.length - 1].date);

  if (span < minSpanDays) return { ...nullResult, weighInCount: sorted.length };

  const firstDate = new Date(sorted[0].date + 'T00:00:00Z');
  const xs = sorted.map(p => {
    const d = new Date(p.date + 'T00:00:00Z');
    return (d.getTime() - firstDate.getTime()) / 86400000;
  });
  const ys = sorted.map(p => p.weightLbs);
  const maxX = xs[xs.length - 1];
  const ws = xs.map(x => Math.pow(0.5, (maxX - x) / halfLife));

  const sumW = ws.reduce((a, b) => a + b, 0);
  const xBar = ws.reduce((acc, w, i) => acc + w * xs[i], 0) / sumW;
  const yBar = ws.reduce((acc, w, i) => acc + w * ys[i], 0) / sumW;
  const Sxx = ws.reduce((acc, w, i) => acc + w * Math.pow(xs[i] - xBar, 2), 0);
  const Sxy = ws.reduce((acc, w, i) => acc + w * (xs[i] - xBar) * (ys[i] - yBar), 0);

  if (Math.abs(Sxx) < 1e-10) return { ...nullResult, weighInCount: sorted.length };

  const slope = Sxy / Sxx;
  const lbsPerWeek = slope * 7;

  let confidence: PaceConfidence = 'medium';
  if (sorted.length >= highMinWeighIns && span >= highMinSpanDays) {
    confidence = 'high';
  }

  return {
    lbsPerWeek: Math.round(lbsPerWeek * 1000) / 1000,
    confidence,
    weeksOfData: Math.round((span / 7) * 10) / 10,
    weighInCount: sorted.length,
  };
}
