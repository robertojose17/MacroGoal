export type ISODateString = string;
export type ISOTimestamp = string;
export type PaceConfidence = 'high' | 'medium' | null;
export type LoggingReliability = 'high' | 'medium' | 'low' | 'insufficient';
export type TDEESource = 'observed' | 'formula' | 'none';
export type TDEEConfidence = 'medium' | 'low' | null;
export type ProjectionBasis = 'observed' | 'intended' | 'none';
export type GoalType = 'lose' | 'maintain' | 'gain' | null;
export type TargetConfidence = 'high' | 'medium' | 'none';

export type DataQualityFlag =
  | 'LOW_LOGGING_FREQUENCY'
  | 'SPARSE_MEAL_DISTRIBUTION'
  | 'VERY_LOW_RECORDED_INTAKE'
  | 'VERY_HIGH_RECORDED_INTAKE'
  | 'WEIGHT_DATA_SPARSE'
  | 'WEIGHT_DATA_STALE'
  | 'HISTORICAL_TARGET_UNCERTAINTY'
  | 'LEGACY_WEIGHT_FALLBACK_USED';

export type ProgressStatus =
  | 'INSUFFICIENT_DATA'
  | 'ON_TRACK'
  | 'ABOVE_TARGET_PACE'
  | 'BELOW_TARGET_PACE'
  | 'WEIGHT_STABLE'
  | 'TRENDING_UP'
  | 'MAINTAINING'
  | 'GOAL_REACHED';

export interface TDEEEstimate {
  value: number | null;
  source: TDEESource;
  confidence: TDEEConfidence;
}

export interface WeightPace {
  lbsPerWeek: number | null;
  confidence: PaceConfidence;
  weeksOfData: number;
  weighInCount: number;
}

export interface GoalProjection {
  projectedGoalDate: ISODateString | null;
  projectedGoalDateRange: {
    earliest: ISODateString;
    latest: ISODateString;
    methodNote: 'heuristic_±15pct';
  } | null;
  projectionBasis: ProjectionBasis;
  projectionConfidence: 'medium' | 'low' | null;
  weeksToGoal: number | null;
}

export interface AdaptiveAdjustmentRecord {
  weekStart: ISODateString;
  effectiveDate: ISODateString;
  adjustmentKcal: number;
  prescribedCalories: number;
  avgCaloriesEaten: number;
  avgWeightLbs: number;
  dataQualityDays: number;
  skipReason: string | null;
  estimatedTdee: number | null;
}

export interface AdherenceResult {
  score: number | null;
  adherenceDaysEvaluated: number;
  coverageFraction: number;
  windowDays: number;
  calorieAdherenceFraction: number | null;
  proteinAdherenceFraction: number | null;
}

export interface TargetEvent {
  effectiveDate: ISODateString;
  sourceWeekStart: ISODateString | null;
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

export interface ProgressState {
  userId: string;
  computedAt: ISOTimestamp;
  dataWindowDays: number;
  goalType: GoalType;
  gainGoalLimitedSupport: boolean;
  currentWeightLbs: number | null;
  trendWeightLbs: number | null;
  lastWeighInDate: ISODateString | null;
  daysSinceLastWeighIn: number | null;
  weightPace: WeightPace;
  currentCalorieTarget: number | null;
  baseCalorieTarget: number | null;
  intendedLossRateLbsPerWeek: number | null;
  tdee: TDEEEstimate;
  avgDailyCaloriesLogged: number | null;
  avgDailyProteinLogged: number | null;
  currentProteinTarget: number | null;
  loggingReliability: LoggingReliability;
  dataQualityFlags: DataQualityFlag[];
  loggedDaysLast7: number;
  loggedDaysLast14: number;
  avgMealsPerLoggedDay: number | null;
  adherence: AdherenceResult;
  progressStatus: ProgressStatus;
  possiblePlateau: boolean;
  lowLoggingReliability: boolean;
  goalWeightLbs: number | null;
  projection: GoalProjection;
  journeyStartDate: ISODateString | null;
  journeyStartWeightLbs: number | null;
  totalWeightChangeLbs: number | null;
  daysSinceJourneyStart: number | null;
  progressToGoalFraction: number | null;
  lastAdaptiveAdjustment: AdaptiveAdjustmentRecord | null;
  adaptiveAdjustmentCount: number;
  adaptiveHistory: AdaptiveAdjustmentRecord[];
}
