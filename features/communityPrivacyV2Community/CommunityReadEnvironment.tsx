import { isCommunityWindowFocused, observeCommunityWindowFocus } from '@/features/communityPrivacyV2/communityWindowFocus.mjs';
import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { getCommunityPrivacyActivation } from '../communityPrivacyV2/communityPrivacyRollout';
import { createCommunityReaderRuntime, EMPTY_COMMUNITY_READ_STATE } from './communityReaderRuntime';
import type { CommunityReaderRuntime } from './communityReaderRuntime';
const Environment = createContext<CommunityReaderRuntime | null>(null);
const subscribeDisabled = () => () => {};
const disabledSnapshot = () => EMPTY_COMMUNITY_READ_STATE;
export function CommunityReadProvider({ children, activation }: {
  children: React.ReactNode;
  activation: ReturnType<typeof getCommunityPrivacyActivation>;
}) {
  const runtime = useMemo(() => createCommunityReaderRuntime(supabase, {
    actorId: activation.actorId,
    isCurrent: () => {
      const live = getCommunityPrivacyActivation();
      return live.status === 'ready' && live.mode === 'protected' &&
        live.actorId === activation.actorId && live.scopeKey === activation.scopeKey;
    },
    allowAutomaticWrites: activation.rollout !== 'pair',
  }), [activation.actorId, activation.scopeKey, activation.rollout]);
  useFocusEffect(useCallback(() => {
    const update = (state: string | null) => { if (state === 'active' && isCommunityWindowFocused(Platform.OS)) runtime.activate(); else runtime.deactivate(); };
    const change = AppState.addEventListener('change', update);
    const unobserve = observeCommunityWindowFocus(Platform.OS, AppState, runtime.deactivate, () => update(AppState.currentState));
    update(AppState.currentState);
    return () => { change.remove(); unobserve(); runtime.deactivate(); };
  }, [runtime]));
  return <Environment.Provider value={runtime}>{children}</Environment.Provider>;
}
export function useCommunityReadEnvironment() {
  const runtime = useContext(Environment);
  const state = useSyncExternalStore(runtime?.subscribe ?? subscribeDisabled, runtime?.getSnapshot ?? disabledSnapshot, disabledSnapshot);
  return { runtime, state };
}
