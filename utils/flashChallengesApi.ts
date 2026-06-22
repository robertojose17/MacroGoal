import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

export type MetricType = 'steps' | 'active_calories' | 'exercise_minutes' | 'distance' | 'floors' | 'running_pace' | 'referral';
export type Difficulty = 'medium' | 'hard';

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

// Baseline targets by activity level — used when no HealthKit history exists
// These mirror what top fitness apps use for new user onboarding
const ACTIVITY_BASELINES: Record<ActivityLevel, Record<string, { medium: number; hard: number }>> = {
  sedentary: {
    steps:            { medium: 4000,  hard: 6000  },
    active_calories:  { medium: 150,   hard: 250   },
    exercise_minutes: { medium: 10,    hard: 20    },
    distance:         { medium: 1.5,   hard: 2.5   },
    floors:           { medium: 3,     hard: 6     },
    running_pace:     { medium: 14,    hard: 12    },
  },
  light: {
    steps:            { medium: 6000,  hard: 9000  },
    active_calories:  { medium: 250,   hard: 400   },
    exercise_minutes: { medium: 20,    hard: 35    },
    distance:         { medium: 2.5,   hard: 4.0   },
    floors:           { medium: 5,     hard: 10    },
    running_pace:     { medium: 12,    hard: 10    },
  },
  moderate: {
    steps:            { medium: 8000,  hard: 12000 },
    active_calories:  { medium: 350,   hard: 550   },
    exercise_minutes: { medium: 30,    hard: 50    },
    distance:         { medium: 4.0,   hard: 6.0   },
    floors:           { medium: 8,     hard: 15    },
    running_pace:     { medium: 10,    hard: 8     },
  },
  very_active: {
    steps:            { medium: 12000, hard: 18000 },
    active_calories:  { medium: 500,   hard: 750   },
    exercise_minutes: { medium: 45,    hard: 70    },
    distance:         { medium: 6.0,   hard: 10.0  },
    floors:           { medium: 12,    hard: 20    },
    running_pace:     { medium: 8,     hard: 6.5   },
  },
};

// Fallback if activity_level is unknown
const DEFAULT_BASELINES = ACTIVITY_BASELINES['light'];

export interface FlashChallenge {
  id: string;
  user_id: string;
  date: string;
  metric_type: MetricType;
  difficulty: Difficulty;
  target_value: number;
  target_unit: string;
  title: string;
  description: string;
  xp_reward: number;
  expires_at: string;
  completed: boolean;
  completed_at: string | null;
}

// XP rewards by difficulty
const XP_REWARDS: Record<Difficulty, number> = {
  medium: 500,
  hard: 750,
};

// Challenge templates
const CHALLENGE_TEMPLATES: Record<MetricType, {
  title: (target: number, unit: string) => string;
  description: (target: number, unit: string) => string;
  unit: string;
}> = {
  steps: {
    title: (t) => `Walk ${t.toLocaleString()} Steps`,
    description: (t) => `Hit ${t.toLocaleString()} steps today to earn bonus XP.`,
    unit: 'steps',
  },
  active_calories: {
    title: (t) => `Burn ${t} Active Calories`,
    description: (t) => `Burn ${t} active calories today to earn bonus XP.`,
    unit: 'cal',
  },
  exercise_minutes: {
    title: (t) => `${t} Minutes of Exercise`,
    description: (t) => `Get ${t} minutes of active exercise today.`,
    unit: 'min',
  },
  distance: {
    title: (t, u) => `Cover ${t} ${u}`,
    description: (t, u) => `Walk or run ${t} ${u} today.`,
    unit: 'mi',
  },
  floors: {
    title: (t) => `Climb ${t} Floors`,
    description: (t) => `Climb ${t} floors today using stairs.`,
    unit: 'floors',
  },
  running_pace: {
    title: (t) => `Run 1 Mile Under ${t} Min`,
    description: (t) => `Complete a 1-mile run in under ${t} minutes.`,
    unit: 'min/mi',
  },
};

// Percentile helper — returns the value at the given percentile from a sorted array
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

// Round to a "nice" number for display
function roundNice(value: number, metric: MetricType): number {
  if (metric === 'steps') return Math.round(value / 500) * 500;
  if (metric === 'active_calories') return Math.round(value / 25) * 25;
  if (metric === 'exercise_minutes') return Math.round(value / 5) * 5;
  if (metric === 'distance') return Math.round(value * 10) / 10;
  if (metric === 'floors') return Math.round(value);
  if (metric === 'running_pace') return Math.round(value * 10) / 10;
  return Math.round(value);
}

// Generate target from baseline using percentile approach
// medium = percentile 60 of last 7 days × 1.2 (20% above median)
// hard   = percentile 90 of last 7 days × 1.4 (40% above high end)
// Falls back to activity-level baselines when no history exists
function generateTarget(
  history: number[],
  difficulty: Difficulty,
  metric: MetricType,
  baselines: Record<string, { medium: number; hard: number }>
): number {
  const baseline = baselines[metric];

  if (history.length === 0) {
    // No history — use activity-level baseline (calibration week)
    return baseline ? baseline[difficulty] : (difficulty === 'medium' ? 100 : 200);
  }

  const sorted = [...history].sort((a, b) => a - b);
  let target: number;

  if (difficulty === 'medium') {
    const base = percentile(sorted, 60);
    target = roundNice(base * 1.2, metric);
  } else {
    const base = percentile(sorted, 90);
    target = roundNice(base * 1.4, metric);
  }

  // Never go below the baseline for the user's activity level
  // This prevents absurdly low targets if the user had a bad week
  const floor = baseline ? baseline[difficulty] * 0.5 : 1;
  return Math.max(target, floor);
}

// Pick 2 metric types that don't repeat from yesterday
// Always one medium and one hard, different metric types
function pickMetricTypes(yesterday: MetricType[]): [MetricType, MetricType] {
  const all: MetricType[] = ['steps', 'active_calories', 'exercise_minutes', 'distance', 'floors'];
  const available = all.filter(m => !yesterday.includes(m));
  const pool = available.length >= 2 ? available : all;
  // Shuffle deterministically based on today's date
  const today = toLocalDateString();
  const seed = today.replace(/-/g, '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const shuffled = [...pool].sort((a, b) => {
    const ha = (seed * a.charCodeAt(0)) % 97;
    const hb = (seed * b.charCodeAt(0)) % 97;
    return ha - hb;
  });
  return [shuffled[0], shuffled[1] ?? shuffled[0]];
}

export async function loadOrGenerateFlashChallenges(
  healthKitHistory: Partial<Record<MetricType, number[]>>
): Promise<FlashChallenge[]> {
  console.log('[flashChallengesApi] loadOrGenerateFlashChallenges called');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[flashChallengesApi] no user, returning empty');
    return [];
  }

  const { data: userData } = await supabase
    .from('users')
    .select('activity_level')
    .eq('id', user.id)
    .maybeSingle();

  const activityLevel = (userData?.activity_level as ActivityLevel) ?? 'light';
  const baselines = ACTIVITY_BASELINES[activityLevel] ?? DEFAULT_BASELINES;
  console.log('[flashChallengesApi] activity level:', activityLevel);

  const today = toLocalDateString();

  // Check if already generated for today
  const { data: existing, error: existingError } = await supabase
    .from('flash_challenges')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today);

  if (existingError) {
    console.error('[flashChallengesApi] error fetching existing challenges:', existingError);
  }

  if (existing && existing.length >= 1) {
    console.log('[flashChallengesApi] returning existing challenges for today:', existing.length);
    return existing as FlashChallenge[];
  }

  // Get yesterday's metric types to avoid repetition
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const { data: yesterdayData } = await supabase
    .from('flash_challenges')
    .select('metric_type')
    .eq('user_id', user.id)
    .eq('date', yesterdayStr);
  const yesterdayTypes = (yesterdayData ?? []).map((r: any) => r.metric_type as MetricType);

  const [mediumMetric, hardMetric] = pickMetricTypes(yesterdayTypes);
  console.log('[flashChallengesApi] generating challenges — medium:', mediumMetric, 'hard:', hardMetric);

  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);

  const challenges: Omit<FlashChallenge, 'id' | 'created_at'>[] = [];

  for (const [metric, difficulty] of [[mediumMetric, 'medium'], [hardMetric, 'hard']] as [MetricType, Difficulty][]) {
    const history = healthKitHistory[metric] ?? [];
    const target = generateTarget(history, difficulty, metric, baselines);
    const isCalibrating = history.length === 0;

    const tmpl = CHALLENGE_TEMPLATES[metric];
    const unit = tmpl.unit;
    const baseDescription = tmpl.description(target, unit);
    const description = isCalibrating
      ? baseDescription + ' · Calibrating to your level'
      : baseDescription;

    if (isCalibrating) {
      console.log('[flashChallengesApi] no history for', metric, '— using', activityLevel, 'baseline target:', target);
    }

    challenges.push({
      user_id: user.id,
      date: today,
      metric_type: metric,
      difficulty,
      target_value: target,
      target_unit: unit,
      title: tmpl.title(target, unit),
      description,
      xp_reward: XP_REWARDS[difficulty],
      expires_at: expiresAt.toISOString(),
      completed: false,
      completed_at: null,
    });
  }

  // Referral challenge: only show if user has fewer than 3 lifetime referrals
  // Once they've referred 3 friends total, it permanently exits rotation
  const { count: lifetimeReferrals } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', user.id);

  const hasCompletedReferralGoal = (lifetimeReferrals ?? 0) >= 3;

  if (!hasCompletedReferralGoal) {
    // Only show once per week
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().split('T')[0];

    const { data: existingReferralThisWeek } = await supabase
      .from('flash_challenges')
      .select('id')
      .eq('user_id', user.id)
      .eq('metric_type', 'referral')
      .gte('date', mondayStr)
      .maybeSingle();

    if (!existingReferralThisWeek) {
      console.log('[flashChallengesApi] adding referral challenge (once per week, user has < 3 lifetime referrals)');
      const referralExpiry = new Date();
      referralExpiry.setHours(23, 59, 59, 999);

      challenges.push({
        user_id: user.id,
        date: today,
        metric_type: 'referral' as any,
        difficulty: 'medium',
        target_value: 3,
        target_unit: 'friends',
        title: 'Refer 3 Friends Today',
        description: 'Share your referral code with 3 friends who join Macro Goal today.',
        xp_reward: 3000,
        expires_at: referralExpiry.toISOString(),
        completed: false,
        completed_at: null,
      });
    }
  } else {
    console.log('[flashChallengesApi] skipping referral challenge — user already has 3+ lifetime referrals');
  }

  if (challenges.length === 0) {
    console.log('[flashChallengesApi] no challenges generated (insufficient history)');
    return [];
  }

  console.log('[flashChallengesApi] upserting', challenges.length, 'challenges');
  const { data: inserted, error: upsertError } = await supabase
    .from('flash_challenges')
    .upsert(challenges, { onConflict: 'user_id,date,metric_type', ignoreDuplicates: false })
    .select();

  if (upsertError) {
    console.error('[flashChallengesApi] upsert error:', upsertError);
    // Fall back to fetching existing rows for today
    const { data: fallback } = await supabase
      .from('flash_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today);
    console.log('[flashChallengesApi] fallback fetch returned:', fallback?.length ?? 0, 'challenges');
    return (fallback ?? []) as FlashChallenge[];
  }

  if (!inserted || inserted.length === 0) {
    console.log('[flashChallengesApi] upsert returned 0 rows — fetching existing for today');
    const { data: fallback } = await supabase
      .from('flash_challenges')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today);
    console.log('[flashChallengesApi] fallback fetch returned:', fallback?.length ?? 0, 'challenges');
    return (fallback ?? []) as FlashChallenge[];
  }

  console.log('[flashChallengesApi] inserted:', inserted.length, 'challenges');
  return inserted as FlashChallenge[];
}
