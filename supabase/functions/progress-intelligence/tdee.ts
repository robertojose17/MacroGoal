import { TDEEEstimate, TDEEConfidence } from './types.ts';
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

export function computeTDEE(
  tdeeEstimates: TdeeRowForTDEE[],
  profile: UserProfileForTDEE | null,
  todayStr: string,
): TDEEEstimate {
  const validRows = tdeeEstimates.filter(
    t => t.estimated_tdee !== null && t.skip_reason === null
  );

  if (validRows.length > 0) {
    const sorted = [...validRows].sort((a, b) => b.week_start.localeCompare(a.week_start));
    const mostRecent = sorted[0];

    const twentyEightDaysAgo = new Date(todayStr + 'T00:00:00Z');
    twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
    const twentyEightDaysAgoStr = twentyEightDaysAgo.toISOString().split('T')[0];
    const recentRows = sorted.filter(t => t.week_start >= twentyEightDaysAgoStr);

    let confidence: TDEEConfidence = 'low';
    if (validRows.length >= 4 && recentRows.length >= 2 && (mostRecent.data_days_count ?? 0) >= 4) {
      confidence = 'medium';
    }

    return {
      value: Math.round(Number(mostRecent.estimated_tdee)),
      source: 'observed',
      confidence,
    };
  }

  if (!profile) return { value: null, source: 'none', confidence: null };

  const { sex, date_of_birth, height, current_weight, activity_level } = profile;
  if (!sex || !date_of_birth || !height || !current_weight || !activity_level) {
    return { value: null, source: 'none', confidence: null };
  }

  const age = calculateAge(date_of_birth, todayStr);
  const weightKg = Number(current_weight);
  const heightCm = Number(height);

  let bmr: number;
  if (sex === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  }

  const multiplier = PROGRESS_CONFIG.activityMultipliers[activity_level] ?? 1.375;
  return { value: Math.round(bmr * multiplier), source: 'formula', confidence: 'low' };
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
