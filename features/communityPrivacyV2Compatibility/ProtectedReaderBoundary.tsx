import { useTranslation } from 'react-i18next';
import { socialT as t } from '@/features/communityPrivacyV2/socialTranslations';
import React, { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { createSupabaseInboxAuthBinding } from '../communityPrivacyV2/supabaseInboxAuth';

/** Mounted only by the enabled branch. Scope loss removes the body (and all
 * retained profile/comments/modal state) before an old response can be rendered. */
export function ProtectedReaderBoundary({ children, scopeKey = '' }: { children: React.ReactNode; scopeKey?: string }) {
  useTranslation();
  const binding = useMemo(() => createSupabaseInboxAuthBinding(supabase.auth), []);
  const auth = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const [windowFocused, setWindowFocused] = useState(true);
  const active = focused && appState === 'active' && windowFocused;
  useLayoutEffect(() => {
    if (active) binding.start(); else binding.stop();
    return binding.stop;
  }, [binding, active]);
  useLayoutEffect(() => {
    const changes = AppState.addEventListener('change', setAppState);
    // React Native Web exposes change only. Keep the same privacy boundary on
    // browser focus loss without subscribing to unsupported native events.
    if (Platform.OS === 'web') {
      const onBlur = () => setWindowFocused(false);
      const onFocus = () => setWindowFocused(true);
      if (typeof window !== 'undefined') {
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
      }
      return () => {
        changes.remove();
        if (typeof window !== 'undefined') {
          window.removeEventListener('blur', onBlur);
          window.removeEventListener('focus', onFocus);
        }
      };
    }
    const blur = AppState.addEventListener('blur', () => setWindowFocused(false));
    const focus = AppState.addEventListener('focus', () => setWindowFocused(true));
    return () => { changes.remove(); blur.remove(); focus.remove(); };
  }, []);
  if (!active || !auth.session) return <View accessibilityRole="summary">
    {active && auth.status === 'loading' ? <ActivityIndicator /> :
      <Text>{active ? t('localization.social.sign_in_to_view_this_content') : t('localization.social.content_hidden_while_this_screen_is_inactive')}</Text>}
  </View>;
  return <React.Fragment key={`${auth.session.userId}:${auth.session.sessionKey}:${scopeKey}`}>{children}</React.Fragment>;
}
