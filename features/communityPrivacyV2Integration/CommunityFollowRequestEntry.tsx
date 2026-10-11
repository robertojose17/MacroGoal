import React, { useCallback, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import { FollowRequestBell, FollowRequestInbox } from '../communityPrivacyV2/FollowRequestInbox';
import type { FollowRequestTheme } from '../communityPrivacyV2/FollowRequestInbox';
import { getFollowRequestStrings } from '../communityPrivacyV2/followRequestStrings';
import { createCommunityInboxRuntime } from './communityInboxRuntime';

/** The existing screen mounts this child only under the frozen false feature
 * flag. Do not mount it unconditionally or enable before the coordinated cutover. */
export function CommunityFollowRequestEntry({ theme }: { theme: FollowRequestTheme }) {
  const runtime = useMemo(() => createCommunityInboxRuntime(supabase), []);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const { i18n } = useTranslation();
  const strings = getFollowRequestStrings(i18n.resolvedLanguage ?? i18n.language ?? 'en');

  useFocusEffect(useCallback(() => {
    const update = (appState: string | null) => {
      if (appState === 'active') runtime.activate();
      else runtime.deactivate();
    };
    const listener = AppState.addEventListener('change', update);
    const blur = AppState.addEventListener('blur', runtime.deactivate);
    const focus = AppState.addEventListener('focus', () => update(AppState.currentState));
    update(AppState.currentState); // Unknown/background state is fail-closed.
    return () => { listener.remove(); blur.remove(); focus.remove(); runtime.deactivate(); };
  }, [runtime]));

  return <>
    <FollowRequestBell count={state.totalPending} disabled={!state.scopeKey}
      expanded={state.visible} onPress={runtime.open} theme={theme} strings={strings} />
    <FollowRequestInbox state={state} theme={theme} strings={strings}
      onClose={runtime.close} onRetry={() => { void runtime.refresh(); }}
      onLoadMore={() => { void runtime.loadMore(); }}
      onDecision={(row, decision) => { void runtime.decide(row, decision); }} />
  </>;
}
