import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

export type MetricType = 'steps' | 'active_calories' | 'exercise_minutes' | 'distance' | 'floors' | 'running_pace' | 'referral';
export type Difficulty = 'medium' | 'hard';

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
function generateTarget(history: number[], difficulty: Difficulty, metric: MetricType): number {
  if (history.length === 0) return 0;
  const sorted = [...history].sort((a, b) => a - b);
  if (difficulty === 'medium') {
    const base = percentile(sorted, 60);
    return roundNice(base * 1.2, metric);
  } else {
    const base = percentile(sorted, 90);
    return roundNice(base * 1.4, metric);
  }
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

  const today = toLocalDateString();

  // Check if already generated for today
  const { data: existing } = await supabase
    .from('flash_challenges')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today);

  if (existing && existing.length >= 2) {
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
    const target = generateTarget(history, difficulty, metric);
    if (target <= 0) {
      console.log('[flashChallengesApi] skipping', metric, difficulty, '— target is 0 (no history)');
      continue;
    }

    const tmpl = CHALLENGE_TEMPLATES[metric];
    const unit = tmpl.unit;
    challenges.push({
      user_id: user.id,
      date: today,
      metric_type: metric,
      difficulty,
      target_value: target,
      target_unit: unit,
      title: tmpl.title(target, unit),
      description: tmpl.description(target, unit),
      xp_reward: XP_REWARDS[difficulty],
      expires_at: expiresAt.toISOString(),
      completed: false,
      completed_at: null,
    });
  }

  // Add referral challenge once per week (any day, but only if not already shown this week)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  // Get Monday of current week
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
    console.log('[flashChallengesApi] adding referral challenge (once per week)');
    // 24-hour timer — expires at midnight tonight (same as all other challenges)
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

  if (challenges.length === 0) {
    console.log('[flashChallengesApi] no challenges generated (insufficient history)');
    return [];
  }

  console.log('[flashChallengesApi] upserting', challenges.length, 'challenges');
  const { data: inserted } = await supabase
    .from('flash_challenges')
    .upsert(challenges, { onConflict: 'user_id,date,difficulty', ignoreDuplicates: false })
    .select();

  console.log('[flashChallengesApi] inserted:', inserted?.length ?? 0, 'challenges');
  return (inserted ?? []) as FlashChallenge[];
}
