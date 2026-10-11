import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { createCommunityReaderRuntime, EMPTY_COMMUNITY_READ_STATE } from './communityReaderRuntime';
import type { CommunityReaderRuntime } from './communityReaderRuntime';
const Environment = createContext<CommunityReaderRuntime | null>(null);
const subscribeDisabled = () => () => {};
const disabledSnapshot = () => EMPTY_COMMUNITY_READ_STATE;
export function CommunityReadProvider({ children }: { children: React.ReactNode }) {
  const runtime = useMemo(() => createCommunityReaderRuntime(supabase), []);
  useFocusEffect(useCallback(() => {
    const update = (state: string | null) => { if (state === 'active') runtime.activate(); else runtime.deactivate(); };
    const change = AppState.addEventListener('change', update);
    const blur = AppState.addEventListener('blur', runtime.deactivate);
    const focus = AppState.addEventListener('focus', () => update(AppState.currentState));
    update(AppState.currentState);
    return () => { change.remove(); blur.remove(); focus.remove(); runtime.deactivate(); };
  }, [runtime]));
  return <Environment.Provider value={runtime}>{children}</Environment.Provider>;
}
export function useCommunityReadEnvironment() {
  const runtime = useContext(Environment);
  const state = useSyncExternalStore(runtime?.subscribe ?? subscribeDisabled, runtime?.getSnapshot ?? disabledSnapshot, disabledSnapshot);
  return { runtime, state };
}
