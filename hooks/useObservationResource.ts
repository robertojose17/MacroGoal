import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

import { supabase, SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';
import { subscribeGoalChanged } from '@/utils/goalChangeEvents';
import { observationRolloutEnabled, requestObservation, type ObservationKind } from '@/utils/dynamicTdeeObservation';

// Cache freshness only; this is not a clinical eligibility threshold.
const CACHE_FRESHNESS_MS = 5 * 60 * 1000;

/** No shared cache: a previous account/goal can never seed a new mount. */
export function useObservationResource<T>(kind: ObservationKind, parse: (value: unknown) => T, expectedOwner?: string) {
  const [snapshot, setSnapshot] = useState<{ owner: string; value: T } | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const epoch = useRef(0), mounted = useRef(false), focused = useRef(false), owner = useRef<string | null>(null);
  const reconcileOnFocus = useRef(false), refreshRead = useRef<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null), mutation = useRef<AbortController | null>(null);
  const foreground = useRef(AppState.currentState === 'active');
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearExpiry = useCallback(() => {
    if (expiry.current !== null) clearTimeout(expiry.current);
    expiry.current = null;
  }, []);
  const expected = useRef(expectedOwner); expected.current = expectedOwner;
  const fetchValue = useCallback(async (settings?: {enabled: boolean; reviewDay: number}): Promise<T> => {
    if (!mounted.current || !focused.current || !foreground.current) throw Error('observation_unavailable');
    if (mutation.current) throw Error('observation_busy');
    request.current?.abort(); clearExpiry(); setSnapshot(null);
    const controller = new AbortController(), revision = ++epoch.current;
    request.current = controller;
    if (settings) mutation.current = controller;
    const current = () => mounted.current && focused.current && foreground.current && epoch.current === revision && !controller.signal.aborted;
    setLoading(true); setError(null);
    try {
      if (!observationRolloutEnabled()) throw Error('observation_unavailable');
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;
      if (!current()) throw Error('account_changed');
      if (sessionResult.error || !session || (expected.current && expected.current !== session.user.id) ||
          (owner.current && owner.current !== session.user.id)) throw Error('account_changed');
      owner.current = session.user.id;
      const actor = session.user.id;
      const isCurrent = () => current() && owner.current === actor && (!expected.current || expected.current === actor);
      const raw = await requestObservation({ kind, endpoint:SUPABASE_PROJECT_URL + '/functions/v1/progress-intelligence',
        apiKey:supabasePublicKey, session, expectedOwner:actor, signal:controller.signal, isCurrent,
        enabled:observationRolloutEnabled(), settings });
      const value = parse(raw);
      if (!isCurrent()) throw Error('account_changed');
      setSnapshot({owner:actor,value});
      expiry.current = setTimeout(() => {
        expiry.current = null;
        if (!isCurrent()) return;
        setSnapshot(null); refreshRead.current?.();
      }, CACHE_FRESHNESS_MS);
      return value;
    } catch (failure) {
      if (current()) { setSnapshot(null); setError(failure instanceof Error ? failure.message : 'observation_unavailable'); }
      throw failure;
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (request.current === controller) request.current = null;
      if (current()) setLoading(false);
      // An invalidated POST may have committed despite abort. Reconcile by reading
      // once after the original flight settles; never replay its mutation.
      if (!mutation.current && reconcileOnFocus.current && mounted.current && focused.current && foreground.current) {
        reconcileOnFocus.current = false; refreshRead.current?.();
      }
    }
  }, [kind, parse, clearExpiry]);
  const cancelOutstanding = useCallback(() => {
    ++epoch.current; request.current?.abort(); mutation.current?.abort(); clearExpiry();
  }, [clearExpiry]);
  const refresh = useCallback(() => {
    if (!mounted.current || !focused.current || !foreground.current) return;
    if (mutation.current) { reconcileOnFocus.current = true; setLoading(true); return; }
    void fetchValue().catch(() => {});
  }, [fetchValue]);
  refreshRead.current = refresh;
  useEffect(() => {
    mounted.current = true; owner.current = null; setSnapshot(null);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === owner.current) return;
      cancelOutstanding(); reconcileOnFocus.current = false; owner.current = next;
      setSnapshot(null); setLoading(false); setError(null);
      if (next && (!expected.current || expected.current === next)) refresh();
    });
    const unsubscribe = subscribeGoalChanged(changedOwner => {
      if (changedOwner !== undefined && changedOwner !== owner.current) return;
      cancelOutstanding(); setSnapshot(null); setLoading(false);
      // Queue one read behind any invalidated settings flight, never replay POST.
      refresh();
    });
    const appStateSubscription = AppState.addEventListener('change', next => {
      const active = next === 'active';
      if (active === foreground.current) return;
      foreground.current = active;
      cancelOutstanding(); reconcileOnFocus.current = false;
      setSnapshot(null); setError(null); setLoading(false);
      if (active && focused.current) refresh();
    });
    return () => {
      appStateSubscription.remove();
      mounted.current = false; focused.current = false; reconcileOnFocus.current = false; cancelOutstanding(); subscription.unsubscribe(); unsubscribe();
    };
  }, [expectedOwner, refresh, cancelOutstanding]);
  useFocusEffect(useCallback(() => {
    if (expected.current !== expectedOwner) return;
    focused.current = true;
    // Food/weight screens can change the observation without changing a goal.
    // Never show the preceding focus's snapshot as the newly reconciled result.
    setSnapshot(null); setError(null); setLoading(foreground.current);
    refresh();
    return () => {
      focused.current = false; reconcileOnFocus.current = false;
      cancelOutstanding(); setSnapshot(null); setLoading(false);
    };
  }, [expectedOwner, refresh, cancelOutstanding]));
  const value = snapshot && (!expectedOwner || snapshot.owner === expectedOwner) && snapshot.owner === owner.current ? snapshot.value : null;
  return { value, loading, error, refresh, updateSettings: (enabled: boolean, reviewDay: number) => fetchValue({enabled,reviewDay}) };
}
