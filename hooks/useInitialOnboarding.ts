import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { createNutritionGoalSaveController } from '@/utils/saveNutritionGoal';
import type { NutritionGoalSaveInput } from '@/utils/saveNutritionGoal';
import { validGoal } from '@/utils/nutritionGoalRequest';
import { acceptedGoalSessionFor } from '@/utils/acceptedGoalSession';
import type { AcceptedGoalSession } from '@/utils/acceptedGoalSession';

type Profile = Database['public']['Tables']['users']['Row'];
type Goal = Database['public']['Tables']['goals']['Row'];
export type InitialOnboardingSnapshot = { profile: Profile; goal: Goal | null };
type Controller = ReturnType<typeof createNutritionGoalSaveController>;
const message = (failure: unknown) => failure instanceof Error ? failure.message : 'Unable to verify this request. Please review your information.';

export function useInitialOnboarding() {
  const [snapshot, setSnapshot] = useState<InitialOnboardingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recoveredInput, setRecoveredInput] = useState<Pick<NutritionGoalSaveInput, 'operation' | 'goal' | 'profile'> | null>(null);
  const [, render] = useState(0);
  const readRevision = useRef(0);
  const active = useRef(false), revision = useRef(0), owner = useRef<string | null>(null);
  const snapshotRef = useRef<InitialOnboardingSnapshot | null>(null);
  const controller = useRef<Controller | null>(null);
  const goalSession = useRef<AcceptedGoalSession | null>(null);
  const current = useCallback((id: string, epoch: number) => active.current && owner.current === id && revision.current === epoch, []);
  const load = useCallback(async (review = false) => {
    const epoch = revision.current, read = ++readRevision.current;
    const latest = () => active.current && revision.current === epoch && readRevision.current === read;
    setLoading(true); setError(null);
    try {
      const auth = await supabase.auth.getUser();
      if (!latest()) return;
      const id = auth.data.user?.id;
      if (auth.error || !id || auth.data.user?.is_anonymous) throw new Error('Sign in to verify your account before continuing.');
      if (owner.current && owner.current !== id) { setBlocked(true); throw new Error('Account changed. Close this screen and reopen onboarding.'); }
      owner.current = id;
      const bound = acceptedGoalSessionFor(id); goalSession.current = bound; controller.current = bound.save;
      await bound.recover(() => current(id, epoch) && latest());
      if (!current(id, epoch) || !latest()) return;
      if (bound.restart.ownsPending() || (bound.save.ownsPending() && bound.save.pendingScope() !== 'initial_onboarding')) {
        setBlocked(true); throw new Error('A manual goal or journey request is unresolved. Review it in Settings, not onboarding.');
      }
      if (bound.save.ownsPending()) setRecoveredInput(bound.save.pendingData());
      // Focus/token refresh never renews CAS for a form that was already opened.
      if (snapshotRef.current && !review) return;
      if (review && controller.current.ownsPending() && !await controller.current.discardAsync()) throw new Error('The previous result is uncertain. Retry that exact request first.');
      if (review) { await bound.recover(() => current(id, epoch) && latest()); setRecoveredInput(null); }
      if (review) { snapshotRef.current = null; setSnapshot(null); }
      const [profile, goal] = await Promise.all([
        supabase.from('users').select('*').eq('id', id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', id).eq('is_active', true).maybeSingle(),
      ]);
      const latestAuth = await supabase.auth.getUser();
      if (!current(id, epoch) || !latest()) return;
      if (latestAuth.error || latestAuth.data.user?.id !== id) { setBlocked(true); throw new Error('Account changed. Reopen onboarding.'); }
      if (profile.error || goal.error || !profile.data || profile.data.id !== id || (goal.data !== null && !validGoal(goal.data, id))) throw new Error('Unable to verify the current profile and goal. Nothing was saved.');
      if (profile.data.onboarding_completed && !controller.current.hasPending()) { setBlocked(true); throw new Error('Onboarding is already complete. Review your goals in Settings instead.'); }
      const next = { profile: { ...profile.data }, goal: goal.data ? { ...goal.data } : null };
      snapshotRef.current = next; setSnapshot(next);
    } catch (failure) {
      if (latest()) setError(message(failure));
    } finally {
      if (latest()) { setLoading(false); setSaving(controller.current?.isBusy() ?? false); render(n => n + 1); }
    }
  }, [current]);
  useFocusEffect(useCallback(() => {
    active.current = true; revision.current += 1;
    void load();
    return () => { active.current = false; revision.current += 1; };
  }, [load]));
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner.current && session?.user.id !== owner.current) {
        revision.current += 1; owner.current = null; snapshotRef.current = null; controller.current = null; goalSession.current = null;
        setSnapshot(null); setRecoveredInput(null); setBlocked(true); setLoading(false); setSaving(false); setSaved(false);
        setError('Account changed. Close this screen and reopen onboarding.');
      }
    });
    return () => { data.subscription.unsubscribe(); active.current = false; revision.current += 1; };
  }, []);
  const run = useCallback(async (input?: Pick<NutritionGoalSaveInput, 'goal' | 'profile'>) => {
    const id = owner.current, epoch = revision.current, target = controller.current, captured = snapshotRef.current;
    // Validate owner BEFORE setting a spinner. Missing auth must remain recoverable.
    if (!id || !target || !captured || blocked || !current(id, epoch)) { setError('Your account could not be verified. Reopen this screen.'); return false; }
    if (target.isBusy() || goalSession.current?.restart.isBusy()) return false;
    if (goalSession.current?.restart.ownsPending() || (target.ownsPending() && target.pendingScope() !== 'initial_onboarding')) { setError('Resolve the manual goal or journey request in Settings first.'); return false; }
    setSaving(true); setError(null);
    try {
      if (input) {
        if (target.hasPending()) throw new Error('Resolve the previous request before saving a new one.');
        await target.save({ userId: id, expectedProfileUpdatedAt: captured.profile.updated_at, expectedGoal: captured.goal,
          operation: 'initial_onboarding', goal: input.goal, profile: input.profile, isCurrent: () => current(id, epoch) });
      } else {
        if (!target.canRetry()) throw new Error('This request needs review, not another retry.');
        await target.retry(() => current(id, epoch));
      }
      if (!current(id, epoch)) return false;
      await goalSession.current?.recover(() => current(id, epoch));
      if (!current(id, epoch)) return false;
      setSaved(true); return true;
    } catch (failure) { if (current(id, epoch)) setError(message(failure)); return false; }
    finally {
      // An old flight may finish after a blur/refocus. It owns this controller's
      // busy flag, but must not publish saved data into a newer account.
      if (active.current && owner.current === id && controller.current === target) { setSaving(target.isBusy()); render(n => n + 1); }
    }
  }, [blocked, current]);
  return { snapshot, loading, saving, error, blocked, saved, recoveredInput, run,
    pending: controller.current?.hasPending() ?? false,
    canRetry: controller.current?.pendingScope() === 'initial_onboarding' && controller.current.canRetry(),
    review: () => load(true), clearError: () => setError(null) };
}
