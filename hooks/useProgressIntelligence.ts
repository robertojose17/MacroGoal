import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

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
  confidence: 'high' | 'medium' | 'low';
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

// ── In-memory cache (5-minute TTL) ───────────────────────────────────────────

const PIE_ENDPOINT = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/progress-intelligence';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  state: ProgressState;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(userId: string): ProgressState | null {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return entry.state;
}

function setCached(userId: string, state: ProgressState): void {
  cache.set(userId, { state, fetchedAt: Date.now() });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface UseProgressIntelligenceResult {
  state: ProgressState | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProgressIntelligence(): UseProgressIntelligenceResult {
  const [state, setState] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshCounterRef = useRef(0);

  const fetchPIE = useCallback(async () => {
    console.log('[useProgressIntelligence] Starting fetch');
    setLoading(true);
    setError(null);

    try {
      // Get current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData?.session) {
        console.warn('[useProgressIntelligence] No active session, skipping PIE fetch');
        setLoading(false);
        return;
      }

      const { access_token, user } = sessionData.session;
      const userId = user.id;

      console.log('[useProgressIntelligence] Fetching PIE for userId:', userId);

      // Check cache first
      const cached = getCached(userId);
      if (cached) {
        console.log('[useProgressIntelligence] Cache hit for userId:', userId);
        setState(cached);
        setLoading(false);
        return;
      }

      // Call edge function
      console.log('[useProgressIntelligence] Cache miss — calling edge function');
      const response = await fetch(PIE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${access_token}`,
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[useProgressIntelligence] Edge function error:', response.status, text);
        setError(`PIE fetch failed: ${response.status}`);
        setLoading(false);
        return;
      }

      const data: ProgressState = await response.json();
      console.log('[useProgressIntelligence] PIE response received, progressStatus:', data.progressStatus);

      setCached(userId, data);
      setState(data);
      setLoading(false);
    } catch (err: any) {
      console.error('[useProgressIntelligence] Unexpected error:', err?.message ?? err);
      setError(err?.message ?? 'Unknown error');
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    console.log('[useProgressIntelligence] Manual refresh triggered');
    // Bust cache for current user on next fetch
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user?.id) {
        cache.delete(data.session.user.id);
        console.log('[useProgressIntelligence] Cache cleared for userId:', data.session.user.id);
      }
    });
    refreshCounterRef.current += 1;
    fetchPIE();
  }, [fetchPIE]);

  useEffect(() => {
    // Non-blocking: fire and forget — component renders immediately with state=null
    fetchPIE();
  }, [fetchPIE]);

  return { state, loading, error, refresh };
}
