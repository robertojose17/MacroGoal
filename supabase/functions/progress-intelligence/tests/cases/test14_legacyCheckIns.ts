import { assertApprox, assertEq, assertIncludes, TestResult } from '../helpers.ts';
import { resolveWeightSource } from '../../weightSource.ts';
import { PROGRESS_CONFIG } from '../../config.ts';

export function runTest14(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  // trackerWeights = [] (empty)
  const trackerWeights: Array<{ date: string; value: number }> = [];

  // checkInWeights: 10 rows including 2 on '2025-01-15'
  // Dedup: keep 82.10 (later updated_at) → 181.0 lbs
  const checkInWeights = [
    { date: '2025-01-05', weight: 83.0, updated_at: '2025-01-05T10:00:00Z' },
    { date: '2025-01-06', weight: 82.8, updated_at: '2025-01-06T10:00:00Z' },
    { date: '2025-01-07', weight: 82.6, updated_at: '2025-01-07T10:00:00Z' },
    { date: '2025-01-08', weight: 82.5, updated_at: '2025-01-08T10:00:00Z' },
    { date: '2025-01-09', weight: 82.3, updated_at: '2025-01-09T10:00:00Z' },
    { date: '2025-01-10', weight: 82.2, updated_at: '2025-01-10T10:00:00Z' },
    { date: '2025-01-11', weight: 82.0, updated_at: '2025-01-11T10:00:00Z' },
    { date: '2025-01-12', weight: 81.9, updated_at: '2025-01-12T10:00:00Z' },
    // Two entries on Jan 15 — keep the later one (82.10 kg)
    { date: '2025-01-15', weight: 81.65, updated_at: '2025-01-15T08:00:00Z' },
    { date: '2025-01-15', weight: 82.10, updated_at: '2025-01-15T14:00:00Z' },
  ];

  const result = resolveWeightSource(trackerWeights, checkInWeights, PROGRESS_CONFIG.trendWeightMinWeighIns);
  outputs['usedLegacyFallback'] = result.usedLegacyFallback;
  outputs['pointCount'] = result.points.length;

  assertEq(failures, 'usedLegacyFallback', result.usedLegacyFallback, true);

  // Should have 9 unique dates (deduped Jan 15)
  assertEq(failures, 'pointCount', result.points.length, 9);

  // Jan 15 should be 82.10 kg * 2.20462 = 181.0 lbs (approx)
  const jan15Point = result.points.find(p => p.date === '2025-01-15');
  outputs['jan15WeightLbs'] = jan15Point?.weightLbs;
  assertApprox(failures, 'jan15WeightLbs', jan15Point?.weightLbs, 82.10 * 2.20462, 0.01);

  // dataQualityFlags includes 'LEGACY_WEIGHT_FALLBACK_USED' (checked via usedLegacyFallback)
  if (!result.usedLegacyFallback) {
    failures.push('LEGACY_WEIGHT_FALLBACK_USED: expected usedLegacyFallback=true');
  }

  return { name: 'test14_legacyCheckIns', passed: failures.length === 0, failures, outputs };
}
