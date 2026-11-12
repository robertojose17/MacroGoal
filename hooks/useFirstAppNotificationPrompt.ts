import { useEffect } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import { useSegments } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '@/contexts/NotificationContext';
import { supabase } from '@/lib/supabase/client';
import {
  isFirstAppNotificationRoute, NOTIFICATION_PROMPT_KEY, promptFirstAppNotifications,
} from '@/utils/firstAppNotificationPrompt';

export function useFirstAppNotificationPrompt() {
  const segments = useSegments();
  const route = segments.join('/');
  const eligible = isFirstAppNotificationRoute(segments);
  const { loading } = useNotifications();

  useEffect(() => {
    if (!eligible || loading || Platform.OS === 'web' || Constants.appOwnership === 'expo') return;
    let active = true;
    let owner: string | null = null;
    const isCurrent = () => active && owner !== null && AppState.currentState === 'active';
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner && owner !== session?.user.id) { active = false; owner = null; }
    });
    const run = async () => {
      try {
        if (!active || AppState.currentState !== 'active') return;
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user || !active) return;
        owner = data.user.id;
        // Native-only imports: do not load native SDKs in the web bundle.
        const Notifications = require('expo-notifications');
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
    const task = InteractionManager.runAfterInteractions(() => { void run(); });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void run();
    });
    return () => { active = false; owner = null; task.cancel(); appState.remove(); subscription.unsubscribe(); };
  }, [eligible, route, loading]);
}
