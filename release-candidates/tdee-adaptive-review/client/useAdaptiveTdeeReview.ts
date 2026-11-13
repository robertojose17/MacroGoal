import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { supabase, SUPABASE_PROJECT_URL, supabasePublicKey } from '@/lib/supabase/client';
import { createAdaptiveAcceptanceController, type AcceptanceResult } from '../acceptanceController';
import type { AdaptiveProgram, AdaptiveRequest } from '../apiContract';
import { adaptiveReviewRolloutEnabled, parseAdaptiveProgram, parseAdaptiveReceipt, requestAdaptiveReview } from './adaptiveTdeeReview';
import { createAdaptiveTdeeJournal } from './adaptiveTdeeJournal';
import { adaptiveTdeeJournalStorage } from './adaptiveTdeeJournalStorage';
import { readActiveGoal } from '@/utils/activeGoal';
import { emitGoalChanged, subscribeGoalChanged } from '@/utils/goalChangeEvents';

/** Separate rollout: observation never silently turns into a write-capable feature. */
export function useAdaptiveTdeeReview(expectedOwner: string) {
  const [program,setProgram] = useState<AdaptiveProgram | null>(null);
  const [result,setResult] = useState<AcceptanceResult | null>(null);
  const [error,setError] = useState<string | null>(null), [busy,setBusy] = useState(false);
  const active = useRef(false), foreground = useRef(AppState.currentState === 'active'), generation = useRef(0), flight = useRef(false);
  const owner = useRef(expectedOwner), presented = useRef<AdaptiveProgram['proposal']>(null), ownWrite = useRef(false);
  const requests = useRef(new Set<AbortController>()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedRefresh = useRef(false), refreshRef = useRef<() => void>(() => {});
  const enabled = adaptiveReviewRolloutEnabled();
  const current = useCallback(() => active.current && foreground.current && owner.current === expectedOwner,[expectedOwner]);
  const call = useCallback(async (action: 'program'|'accept'|'receipt', request?: AdaptiveRequest) => {
    const revision = generation.current, abort = new AbortController(); requests.current.add(abort);
    const isCurrent = () => current() && revision === generation.current && !abort.signal.aborted;
    try {
      if (!isCurrent()) throw Error('account_changed');
      const {data,error:authError} = await supabase.auth.getSession();
      if (authError || !data.session || data.session.user.id !== expectedOwner || !isCurrent()) throw Error('account_changed');
      return await requestAdaptiveReview({endpoint:SUPABASE_PROJECT_URL+'/functions/v1/progress-intelligence',apiKey:supabasePublicKey,
        session:data.session,expectedOwner,action,request,signal:abort.signal,isCurrent,enabled});
    } finally { requests.current.delete(abort); }
  },[current,enabled,expectedOwner]);
  const controller = useMemo(() => createAdaptiveAcceptanceController({
    currentOwner:() => owner.current, isCurrent:current, newRequestId:randomUUID,
    journal:createAdaptiveTdeeJournal(new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0],adaptiveTdeeJournalStorage),
    loadProposal:async (actor,id) => {
      const state = parseAdaptiveProgram(await call('program'),actor);
      const p = state.proposal, shown = presented.current;
      if (!p || p.id !== id || (shown && (p.id !== shown.id || p.digest !== shown.digest))) throw Error('proposal_changed_or_invalid');
      return p;
    },
    safetyState:async actor => parseAdaptiveProgram(await call('program'),actor).safety,
    readReceipt:async request => {
      const receipt = parseAdaptiveReceipt(await call('receipt',request),request);
      if (receipt.status === 'not_found') return {status:'not_found'};
      return receipt;
    },
    acceptAtomic:async request => {
      const receipt = parseAdaptiveReceipt(await call('accept',request),request,true);
      if (receipt.status === 'not_found') throw Error('invalid_adaptive_response');
      return receipt;
    },
  }),[call,current]);
  const cancel = useCallback(() => {
    generation.current++; controller.cancel(); requests.current.forEach(r => r.abort()); requests.current.clear();
    if (timer.current) clearTimeout(timer.current); timer.current = null;
    presented.current = null; setProgram(null); setResult(null); setError(null);
  },[controller]);
  const refresh = useCallback(async () => {
    if (!current()) return;
    if (flight.current) { queuedRefresh.current = true; return; }
    queuedRefresh.current = false;
    flight.current = true; setBusy(true); setError(null); setProgram(null);
    const revision = generation.current;
    try {
      const recovered = await controller.recover();
      if (!current() || generation.current !== revision) return;
      if (recovered.status === 'committed') {
        await readActiveGoal(expectedOwner);
        if (!current() || generation.current !== revision) return;
        ownWrite.current = true; emitGoalChanged(expectedOwner); ownWrite.current = false;
      }
      setResult(recovered);
      // Disabling new recommendations must not disable reconciliation of a
      // previously submitted request. Recovery above only reads receipts.
      if (!enabled) return;
      const state = parseAdaptiveProgram(await call('program'),expectedOwner);
      if (!current() || generation.current !== revision) return;
      presented.current = state.proposal; setProgram(state);
    } catch (failure) {
      if (current() && generation.current === revision) setError(failure instanceof Error ? failure.message : 'adaptive_unavailable');
    } finally {
      flight.current = false;
      if (current()) { setBusy(false); if (queuedRefresh.current) { queuedRefresh.current = false; refreshRef.current(); } }
    }
  },[call,controller,current,enabled,expectedOwner]);
  const run = useCallback(async (action: 'accept'|'retry'|'acknowledge') => {
    if (!current() || flight.current || (action === 'accept' && !enabled)) return;
    const shown = presented.current;
    if (action === 'accept' && (!shown || Date.parse(shown.expiresAt) <= Date.now())) { setError('proposal_expired'); return; }
    flight.current = true; setBusy(true); setError(null);
    const revision = generation.current;
    try {
      const next = await (action === 'accept' ? controller.accept(shown!.id) : action === 'retry' ? controller.retry() : controller.acknowledgeRejection());
      if (!current() || generation.current !== revision) return;
      if (next.status === 'committed') {
        // Receipt proves a write, not the currently active target. Read back before success.
        await readActiveGoal(expectedOwner);
        if (!current() || generation.current !== revision) return;
        ownWrite.current = true; emitGoalChanged(expectedOwner); ownWrite.current = false;
      }
      setResult(next);
      if (next.status === 'committed' || next.status === 'rejection_acknowledged') { presented.current = null; setProgram(null); }
    } catch (failure) { if (current() && generation.current === revision) setError(failure instanceof Error ? failure.message : 'adaptive_unavailable'); }
    finally {
      flight.current = false;
      if (current()) { setBusy(false); if (queuedRefresh.current) { queuedRefresh.current = false; refreshRef.current(); } }
    }
  },[controller,current,enabled,expectedOwner]);
  refreshRef.current = () => { void refresh(); };
  useFocusEffect(useCallback(() => {
    active.current = true; owner.current = expectedOwner; cancel(); void refresh();
    return () => { active.current = false; cancel(); };
  },[cancel,expectedOwner,refresh]));
  useEffect(() => {
    const auth = supabase.auth.onAuthStateChange((_event,session) => {
      const next = session?.user.id ?? '';
      if (next === owner.current) return;
      owner.current = next; cancel(); if (next === expectedOwner) void refresh();
    });
    const app = AppState.addEventListener('change',state => {
      const next = state === 'active'; if (next === foreground.current) return;
      foreground.current = next; cancel(); if (next) void refresh();
    });
    const unsubscribe = subscribeGoalChanged(actor => {
      if (ownWrite.current || (actor !== undefined && actor !== expectedOwner)) return;
      cancel(); void refresh();
    });
    return () => { auth.data.subscription.unsubscribe(); app.remove(); unsubscribe(); };
  },[cancel,expectedOwner,refresh]);
  useEffect(() => {
    if (!program?.proposal) return;
    timer.current = setTimeout(() => { cancel(); void refresh(); },Math.max(0,Math.min(300000,Date.parse(program.proposal.expiresAt)-Date.now())));
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  },[cancel,program,refresh]);
  return {enabled,program,result,error,busy,pending:controller.hasPending(),refresh,accept:() => run('accept'),retry:() => run('retry'),acknowledge:() => run('acknowledge')};
}
