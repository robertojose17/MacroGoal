import { useObservationResource } from './useObservationResource';
import { nullableNumber, record } from '@/utils/dynamicTdeeObservation';
import { emitGoalChanged } from '@/utils/goalChangeEvents';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeightPace {
  lbsPerWeek: number | null;
  confidence: 'high' | 'medium' | null;
}

interface Adherence {
  score: number | null;
  calorieAdherenceFraction: number | null;
  proteinAdherenceFraction: number | null;
  coverageFraction: number;
  adherenceDaysEvaluated: number;
}

interface Projection {
  projectedGoalDate: string | null;
  projectedGoalDateRange: { earliest: string; latest: string } | null;
  projectionConfidence: 'high' | 'medium' | 'low' | null;
  projectionBasis: string;
}

interface JourneyProgress {
  startWeightLbs: number | null;
  goalWeightLbs: number | null;
  currentWeightLbs: number | null;
  progressFraction: number | null;
}

interface TDEEInfo {
  value: number | null;
  source: 'observed' | 'formula' | 'none';
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface ProgressState {
  currentWeightLbs: number | null;
  trendWeightLbs: number | null;
  weightPace: WeightPace;
  progressStatus: string;
  loggingReliability: 'insufficient' | 'low' | 'medium' | 'high';
  adherence: Adherence;
  tdee: TDEEInfo;
  projection: Projection;
  journeyProgress: JourneyProgress;
  dataQualityFlags: string[];
  loggedDaysLast7: number;
  loggedDaysLast14: number;
}

function weight(value: unknown): number | null {
  const parsed = nullableNumber(value);
  if (parsed !== null && parsed <= 0) throw Error('invalid_observation');
  return parsed;
}
function fraction(value: unknown): number | null {
  const number = nullableNumber(value);
  if (number !== null && (number < 0 || number > 1)) throw Error('invalid_observation');
  return number;
}
function requiredFraction(value: unknown): number {
  const parsed = fraction(value); if (parsed === null) throw Error('invalid_observation'); return parsed;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw Error('invalid_observation');
  return value;
}
export function parseObservedProgress(value: unknown): ProgressState {
  const v = record(value), safety = record(v.safety), tdee = record(v.tdee), projection = record(v.projection);
  if (v.observationOnly !== true || v.observationVersion !== 'observed-progress-v1' || v.interpretationAvailable !== false ||
      v.proposal !== null || safety.enabled !== false || safety.eligibility !== 'unverified' ||
      tdee.confidence !== null || tdee.value !== null || tdee.source !== 'none' || projection.projectedGoalDate !== null ||
      projection.projectedGoalDateRange !== null || projection.projectionConfidence !== null || projection.projectionBasis !== 'none') throw Error('invalid_observation');
  const pace = record(v.weightPace), adherence = record(v.adherence), journey = record(v.journeyProgress);
  if (pace.confidence !== null && pace.confidence !== 'high' && pace.confidence !== 'medium') throw Error('invalid_observation');
  const reliability = v.loggingReliability;
  if (reliability !== 'insufficient' && reliability !== 'low' && reliability !== 'medium' && reliability !== 'high') throw Error('invalid_observation');
  if (v.progressStatus !== 'INSUFFICIENT_DATA' || !Array.isArray(v.dataQualityFlags) || !v.dataQualityFlags.every((flag: unknown) => typeof flag === 'string')) throw Error('invalid_observation');
  const flags: string[] = []; for (const flag of v.dataQualityFlags) if (typeof flag === 'string') flags.push(flag);
  return { currentWeightLbs:weight(v.currentWeightLbs), trendWeightLbs:weight(v.trendWeightLbs),
    weightPace:{lbsPerWeek:nullableNumber(pace.lbsPerWeek),confidence:pace.confidence}, progressStatus:v.progressStatus,
    loggingReliability:reliability, adherence:{score:fraction(adherence.score),calorieAdherenceFraction:fraction(adherence.calorieAdherenceFraction),
      proteinAdherenceFraction:fraction(adherence.proteinAdherenceFraction),coverageFraction:requiredFraction(adherence.coverageFraction),
      adherenceDaysEvaluated:count(adherence.adherenceDaysEvaluated)},
    tdee:{value:null,source:'none',confidence:null}, projection:{projectedGoalDate:null,projectedGoalDateRange:null,projectionConfidence:null,projectionBasis:'none'},
    journeyProgress:{startWeightLbs:weight(journey.startWeightLbs),goalWeightLbs:weight(journey.goalWeightLbs),
      currentWeightLbs:weight(journey.currentWeightLbs),progressFraction:fraction(journey.progressFraction)},
    dataQualityFlags:flags,loggedDaysLast7:count(v.loggedDaysLast7),loggedDaysLast14:count(v.loggedDaysLast14) };
}
export function invalidatePIECache(userId: string): void { emitGoalChanged(userId); }
export function useProgressIntelligence(userId?: string) {
  const resource = useObservationResource('progress', parseObservedProgress, userId);
  return { state:resource.value, loading:resource.loading, error:resource.error, refresh:resource.refresh };
}
