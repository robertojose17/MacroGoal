import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

export type MetricType = 'steps' | 'active_calories' | 'exercise_minutes' | 'distance' | 'floors' | 'running_pace' | 'referral';
export type Difficulty = 'medium' | 'hard';

const SUPABASE_FUNCTIONS_URL = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1';

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
  // Accept-based flow fields
  accepted_at: string | null;
  baseline_value: number | null;
  duration_hours: number;
  challenge_status: 'available' | 'accepted' | 'completed' | 'expired';
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Calls generate-flash-challenges to ensure today's challenges exist,
 * then fetches them from the DB and returns them.
 */
export async function loadOrGenerateFlashChallenges(): Promise<FlashChallenge[]> {
  console.log('[flashChallengesApi] loadOrGenerateFlashChallenges called');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log('[flashChallengesApi] no user, returning empty');
    return [];
  }

  // Call edge function to generate today's challenges if not yet generated
  try {
    const headers = await getAuthHeaders();
    console.log('[flashChallengesApi] calling generate-flash-challenges edge function');
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-flash-challenges`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ local_date: toLocalDateString() }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn('[flashChallengesApi] generate-flash-challenges returned', res.status, errText);
    } else {
      const body = await res.json();
      console.log('[flashChallengesApi] generate-flash-challenges response:', body);
    }
  } catch (e) {
    console.warn('[flashChallengesApi] generate-flash-challenges network error:', e);
  }

  // Fetch today's challenges from DB
  const today = toLocalDateString();
  const { data, error } = await supabase
    .from('flash_challenges')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .neq('challenge_status', 'expired')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[flashChallengesApi] error fetching challenges:', error);
    return [];
  }

  console.log('[flashChallengesApi] fetched', data?.length ?? 0, 'challenges for today');
  return (data ?? []) as FlashChallenge[];
}

/**
 * Accepts a challenge — sets accepted_at, baseline_value, resets expires_at.
 */
export async function acceptChallenge(challengeId: string, baselineValue: number): Promise<FlashChallenge> {
  console.log('[flashChallengesApi] acceptChallenge called', { challengeId, baselineValue });
  const headers = await getAuthHeaders();

  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/accept-flash-challenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ challenge_id: challengeId, baseline_value: baselineValue }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[flashChallengesApi] accept-flash-challenge error', res.status, errText);
    throw new Error(`accept-flash-challenge failed: ${res.status} ${errText}`);
  }

  const body = await res.json();
  console.log('[flashChallengesApi] acceptChallenge response:', body);
  return body as FlashChallenge;
}

/**
 * Completes a challenge server-side and awards XP.
 */
export async function completeChallenge(challengeId: string, xpReward: number): Promise<{ xp_awarded: number }> {
  console.log('[flashChallengesApi] completeChallenge called', { challengeId, xpReward });
  const headers = await getAuthHeaders();

  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/complete-flash-challenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ challenge_id: challengeId, xp_reward: xpReward }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[flashChallengesApi] complete-flash-challenge error', res.status, errText);
    throw new Error(`complete-flash-challenge failed: ${res.status} ${errText}`);
  }

  const body = await res.json();
  console.log('[flashChallengesApi] completeChallenge response:', body);
  return body as { xp_awarded: number };
}
