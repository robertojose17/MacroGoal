import { useEffect } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import { useSegments } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/supabase/client';
import {
  createNotificationSessionEpoch, isFirstAppNotificationRoute, NOTIFICATION_PROMPT_KEY, promptFirstAppNotifications,
} from '@/utils/firstAppNotificationPrompt';

export function useFirstAppNotificationPrompt() {
  const segments = useSegments();
  const route = segments.join('/');
  const eligible = isFirstAppNotificationRoute(segments);
  const { loading } = useNotifications();

  useEffect(() => {
    if (!eligible || loading || Platform.OS === 'web' || Constants.appOwnership === 'expo') return;
    let active = true;
    const epoch = createNotificationSessionEpoch();
    let authRetry: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        if (!active || AppState.currentState !== 'active') return;
        const revision = epoch.capture();
        const { data, error } = await supabase.auth.getUser();
        const isCurrent = () => active && epoch.isCurrent(revision) && AppState.currentState === 'active';
        if (error || !data.user || !isCurrent()) return;
        // Native-only imports: do not load native SDKs in the web bundle.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Notifications = require('expo-notifications');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { OneSignal } = require('react-native-onesignal');
        await promptFirstAppNotifications({
          readMarker: () => AsyncStorage.getItem(NOTIFICATION_PROMPT_KEY),
          mark: () => AsyncStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true'),
          permission: () => Notifications.getPermissionsAsync(),
          isCurrent,
          // Never offer a Settings redirect after a previous refusal.
          request: () => OneSignal.Notifications.requestPermission(false),
        });
      } catch (error) {
        console.warn('[OneSignal] First app-entry permission check failed', error);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      epoch.invalidate();
      // Defer Supabase work outside its auth callback and reject any older getUser result.
      if (authRetry) clearTimeout(authRetry);
      authRetry = setTimeout(() => { void run(); }, 0);
    });
    const task = InteractionManager.runAfterInteractions(() => { void run(); });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void run();
    });
    return () => { active = false; epoch.invalidate(); if (authRetry) clearTimeout(authRetry); task.cancel(); appState.remove(); subscription.unsubscribe(); };
  }, [eligible, route, loading]);
}
