import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { createNutritionGoalSaveController } from '@/utils/saveNutritionGoal';
import { createJourneyRestartController } from '@/utils/restartNutritionJourney';
import { acceptedGoalSessionFor } from '@/utils/acceptedGoalSession';
import type { AcceptedGoalSession } from '@/utils/acceptedGoalSession';

export class AcceptedGoalReadSuperseded extends Error { constructor() { super('A newer profile read superseded this result.'); this.name = 'AcceptedGoalReadSuperseded'; } }

type Profile = Database['public']['Tables']['users']['Row'];
type Goal = Database['public']['Tables']['goals']['Row'];
export type GoalEditorSnapshot = { profile: Profile; goal: Goal };
type SaveController = ReturnType<typeof createNutritionGoalSaveController>;
type RestartController = ReturnType<typeof createJourneyRestartController>;
type Session = AcceptedGoalSession;
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Unable to verify saved goals. Please review again.'; }

export function useAcceptedGoalEditor(autoLoad = true) {
  // SecureStore recovery is a write prerequisite, not an authentication or
  // profile-reading prerequisite. Browsers currently support read-only goals.
  const nativeEditingSupported = Platform.OS === 'ios' || Platform.OS === 'android';
  const [snapshot, setSnapshot] = useState<GoalEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, render] = useState(0);
  const readRevision = useRef(0);
  const active = useRef(false), epoch = useRef(0), owner = useRef<string | null>(null);
  const session = useRef<Session | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const isCurrent = useCallback((id: string, revision = epoch.current) => active.current && owner.current === id && epoch.current === revision, []);
  const bind = useCallback((id: string) => {
    if (owner.current === id && session.current) return session.current;
    unsubscribe.current?.(); owner.current = id;
    const next = acceptedGoalSessionFor(id); session.current = next;
    const listener = () => { if (active.current && owner.current === id) render(n => n + 1); };
    next.listeners.add(listener); unsubscribe.current = () => next.listeners.delete(listener);
    return next;
  }, []);
  const refresh = useCallback(async () => {
    const revision = epoch.current, requestRevision = ++readRevision.current;
    const latestRead = () => active.current && epoch.current === revision && readRevision.current === requestRevision;
    setLoading(true); setError(''); setSnapshot(null);
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || !auth.data.user || !latestRead()) throw new Error('Account unavailable');
      const id = auth.data.user.id; const bound = bind(id);
      if (nativeEditingSupported) await bound.recover(() => isCurrent(id, revision) && latestRead());
      if (bound.save.pendingScope() === 'initial_onboarding') throw new Error('An onboarding request is unresolved. Reopen onboarding to retry or review that exact request.');
      const [profile, goal] = await Promise.all([
        supabase.from('users').select('*').eq('id', id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', id).eq('is_active', true).maybeSingle(),
      ]);
      const latest = await supabase.auth.getUser();
      if (profile.error || goal.error || !profile.data || !goal.data || profile.data.id !== id || goal.data.user_id !== id || goal.data.is_active !== true || latest.error || latest.data.user?.id !== id || !isCurrent(id, revision) || !latestRead()) throw new Error('Current profile and one active goal must be verified before editing.');
      const result = { profile: { ...profile.data }, goal: { ...goal.data } };
      setSnapshot(result); return result;
    } catch (failure) {
      if (!latestRead()) throw new AcceptedGoalReadSuperseded();
      if (latestRead()) { setSnapshot(null); setError(errorMessage(failure)); }
      throw failure;
    } finally { if (latestRead()) setLoading(false); }
  }, [bind, isCurrent, nativeEditingSupported]);
  useFocusEffect(useCallback(() => {
    active.current = true; epoch.current += 1;
    if (autoLoad) void refresh().catch(() => {});
    return () => { active.current = false; epoch.current += 1; };
  }, [autoLoad, refresh]));
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      if (owner.current !== null && current?.user.id !== owner.current) {
        epoch.current += 1; owner.current = null; session.current = null;
        unsubscribe.current?.(); unsubscribe.current = null;
        setSnapshot(null); setError('Account changed. Reopen this screen.'); setLoading(false);
      }
    });
    return () => { data.subscription.unsubscribe(); unsubscribe.current?.(); active.current = false; epoch.current += 1; };
  }, []);
  const run = useCallback(async (kind: 'save' | 'restart', input?: Parameters<SaveController['save']>[0] | Parameters<RestartController['save']>[0]) => {
    if (!nativeEditingSupported) throw new Error('Goal editing is unavailable in this browser. Your current profile and targets can still be viewed.');
    const current = session.current, id = owner.current, revision = epoch.current;
    if (!current || !id || !isCurrent(id, revision)) throw new Error('Account changed. Reopen this screen.');
    const target = kind === 'save' ? current.save : current.restart;
    const other = kind === 'save' ? current.restart : current.save;
    if (current.save.pendingScope() === 'initial_onboarding') throw new Error('Resolve the onboarding request in onboarding first.');
    if (target.isBusy() || other.isBusy() || other.ownsPending()) throw new Error('Resolve the previous goal or journey request first.');
    if (input && (target.hasPending() || other.hasPending())) throw new Error('A previous request is unresolved. Use its explicit retry or review it.');
    if (!input && !target.canRetry()) throw new Error('This request requires review, not another retry.');
    setError('');
    const notify = () => current.listeners.forEach(listener => listener());
    try {
      let result: Goal;
      if (!input) { const request = target.retry(() => isCurrent(id, revision)); notify(); result = await request; }
      else if (kind === 'save' && 'operation' in input) { const request = current.save.save({ ...input, isCurrent: () => isCurrent(id, revision) && input.isCurrent() }); notify(); result = await request; }
      else if (kind === 'restart' && 'startDate' in input) { const request = current.restart.save({ ...input, isCurrent: () => isCurrent(id, revision) && input.isCurrent() }); notify(); result = await request; }
      else throw new Error('Invalid editor operation');
      if (!isCurrent(id, revision)) throw new Error('Screen changed. Reopen to verify the result.');
      await current.recover(() => isCurrent(id, revision));
      await refresh(); // Failed readback never becomes a success alert.
      return result;
    } catch (failure) { if (isCurrent(id, revision) && !(failure instanceof AcceptedGoalReadSuperseded)) setError(errorMessage(failure)); throw failure; }
    finally { notify(); }
  }, [isCurrent, refresh, nativeEditingSupported]);
  const review = useCallback(async () => {
    if (!nativeEditingSupported) return false;
    const current = session.current, id = owner.current, revision = epoch.current;
    if (!current || !id || !isCurrent(id, revision) || current.save.isBusy() || current.restart.isBusy()) return false;
    await current.recover(() => isCurrent(id, revision));
    if (current.save.pendingScope() === 'initial_onboarding') { setError('Review the unresolved onboarding request in onboarding.'); return false; }
    if ((current.save.ownsPending() && !await current.save.discardAsync()) || (current.restart.ownsPending() && !await current.restart.discardAsync())) {
      setError('The result is uncertain. Retry the exact request before starting another.'); return false;
    }
    await current.recover(() => isCurrent(id, revision));
    await refresh(); return true;
  }, [isCurrent, refresh, nativeEditingSupported]);
  const capture = useCallback(() => { const id = owner.current, revision = epoch.current; return () => !!id && isCurrent(id, revision); }, [isCurrent]);
  const s = session.current;
  return { snapshot, loading, error, refresh, run, review, isCurrent, capture, readOnly: !nativeEditingSupported,
    busy: !!s && (s.save.isBusy() || s.restart.isBusy()),
    pending: !!s && (s.save.hasPending() || s.restart.hasPending()),
    canRetrySave: nativeEditingSupported && !!s && s.save.pendingScope() === 'manual_goal' && s.save.canRetry() && !s.restart.ownsPending() && !s.restart.isBusy(),
    canRetryRestart: nativeEditingSupported && !!s && s.restart.canRetry() && !s.save.ownsPending() && !s.save.isBusy(),
  };
}
