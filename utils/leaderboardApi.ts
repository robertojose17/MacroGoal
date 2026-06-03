
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';

const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA';

export type LeaderboardPeriod = 'today' | 'week' | 'month' | 'last30' | 'custom';

export type LeaderboardEntry = {
  userId: string;
  username: string;
  totalValue: number;
  rank: number;
  isYou: boolean;
};

export type LeaderboardStats = {
  userTotal: number;
  userRank: number;
  totalUsers: number;
  percentile: number;
  communityAvg: number;
};

export type LeaderboardResponse = {
  leaderboard: LeaderboardEntry[];
  stats: LeaderboardStats;
};

const EMPTY_RESPONSE: LeaderboardResponse = {
  leaderboard: [],
  stats: { userTotal: 0, userRank: 0, totalUsers: 0, percentile: 0, communityAvg: 0 },
};

export async function fetchLeaderboard(
  trackerName: string,
  period: LeaderboardPeriod = 'week',
  startDate?: string,
  endDate?: string,
): Promise<LeaderboardResponse> {
  console.log('[LeaderboardApi] fetchLeaderboard()', trackerName, period, startDate, endDate);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authHeader = session?.access_token
      ? `Bearer ${session.access_token}`
      : `Bearer ${SUPABASE_ANON_KEY}`;

    const url = `${SUPABASE_PROJECT_URL}/functions/v1/leaderboard-stats`;
    console.log('[LeaderboardApi] Fetching:', url);

    const body: Record<string, string> = { trackerName, period };
    if (period === 'custom' && startDate && endDate) {
      body.startDate = startDate;
      body.endDate = endDate;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    console.log('[LeaderboardApi] Response status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.warn('[LeaderboardApi] Error response:', response.status, errText.slice(0, 200));
      return EMPTY_RESPONSE;
    }

    const data = await response.json();
    console.log('[LeaderboardApi] Received data, leaderboard entries:', data?.leaderboard?.length ?? 0);
    return {
      leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard : [],
      stats: data?.stats ?? EMPTY_RESPONSE.stats,
    };
  } catch (err) {
    console.warn('[LeaderboardApi] fetchLeaderboard error:', err);
    return EMPTY_RESPONSE;
  }
}
