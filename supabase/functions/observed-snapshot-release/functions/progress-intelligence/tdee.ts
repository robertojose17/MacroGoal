import { TDEEEstimate } from './types.ts';
import { hasSupportedAdultAge } from '../_shared/dynamic-tdee.ts';
import { PROGRESS_CONFIG } from './config.ts';

export interface UserProfileForTDEE {
  sex: string | null;
  date_of_birth: string | null;
  height: number | null;
  current_weight: number | null;
  activity_level: string | null;
}

export interface TdeeRowForTDEE {
  week_start: string;
  estimated_tdee: number | null;
  skip_reason: string | null;
  adjustment_applied: boolean;
  data_days_count: number | null;
}

/**
 * Compatibility formula fallback only. Weekly historical rows do not contain the
 * complete, fresh source interval required to establish today's expenditure.
 * Preserve the call/response shape, but never relabel those rows as a current
 * observation or infer sufficient evidence from their count. Current observed
 * expenditure must come from the separately gated Dynamic TDEE reader.
 */
export function computeTDEE(
  _tdeeEstimates: TdeeRowForTDEE[],
  profile: UserProfileForTDEE | null,
  todayStr: string,
): TDEEEstimate {
  const unavailable: TDEEEstimate = { value: null, source: 'none', confidence: null };
  if (!profile || !hasSupportedAdultAge(profile.date_of_birth, todayStr)) return unavailable;
  const { sex, date_of_birth, height, current_weight, activity_level } = profile;
  if (!['male', 'female'].includes(sex ?? '') || !date_of_birth || !activity_level ||
    !Object.hasOwn(PROGRESS_CONFIG.activityMultipliers, activity_level) ||
    typeof current_weight !== 'number' || !Number.isFinite(current_weight) || current_weight < 30 || current_weight > 350 ||
    // Existing product profile bounds, not clinical eligibility criteria.
    typeof height !== 'number' || !Number.isFinite(height) || height < 100 || height > 250) return unavailable;

  const age = calculateAge(date_of_birth, todayStr);
  const bmr = 10 * current_weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  const value = bmr * PROGRESS_CONFIG.activityMultipliers[activity_level];
  // Same supported expenditure output range as the observational engine. This
  // is a formula estimate, not a dietary minimum or a calorie prescription.
  if (!Number.isFinite(value) || value < 1000 || value > 5000) return unavailable;
  return { value: Math.round(value), source: 'formula', confidence: 'low' };
}

function calculateAge(dob: string, todayStr: string): number {
  const birth = new Date(dob + 'T00:00:00Z');
  const today = new Date(todayStr + 'T00:00:00Z');
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
