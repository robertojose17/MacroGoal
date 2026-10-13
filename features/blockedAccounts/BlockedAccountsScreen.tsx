import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors } from '@/styles/commonStyles';
import { createSupabaseInboxAuthBinding } from '../communityPrivacyV2/supabaseInboxAuth';
import { createBlockedTransport, type BlockedRpcClient } from './transport';
import { createBlockedController, emptyBlockedSnapshot } from './controller';
import { scopeKey, type BlockedSession } from './contracts';
import { blockedStrings } from './strings';

export default function BlockedAccountsScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const strings = blockedStrings(i18n.resolvedLanguage || i18n.language || 'en');
  const dark = useColorScheme() === 'dark';
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [windowFocused, setWindowFocused] = useState(true);
  const active = focused && foreground && windowFocused;
  const activeRef = useRef(active); activeRef.current = active;
  const services = useMemo(() => {
    const binding = createSupabaseInboxAuthBinding(supabase.auth);
    const isCurrent = (session: BlockedSession) => {
      const live = binding.getSnapshot();
      return activeRef.current && live.status === 'ready' && !!live.session && scopeKey(live.session) === scopeKey(session);
    };
    const transport = createBlockedTransport({ client: supabase as unknown as BlockedRpcClient, getSession: binding.getSession, isCurrent });
    return { binding, controller: createBlockedController(transport, isCurrent) };
  }, []);
  const auth = useSyncExternalStore(services.binding.subscribe, services.binding.getSnapshot, services.binding.getSnapshot);
  const observed = useSyncExternalStore(services.controller.subscribe, services.controller.getSnapshot, services.controller.getSnapshot);
  const session = active && auth.status === 'ready' ? auth.session : null;
  const key = session ? scopeKey(session) : null;
  const state = key && observed.scopeKey === key ? observed : emptyBlockedSnapshot();
  useLayoutEffect(() => {
    // Invalidate old rows/confirmation synchronously on auth events, before React rerenders.
    const unsubscribe = services.binding.subscribe(() => {
      const current = services.binding.getSnapshot();
      if (!current.session || current.status !== 'ready' || services.controller.getSnapshot().scopeKey !== scopeKey(current.session)) {
        services.controller.setSession(null);
      }
    });
    services.binding.start();
    return () => { unsubscribe(); services.controller.setSession(null); services.binding.stop(); };
  }, [services]);
  useFocusEffect(useCallback(() => () => { activeRef.current = false; services.controller.setSession(null); }, [services]));
  useLayoutEffect(() => {
    const change = AppState.addEventListener('change', next => {
      if (next !== 'active') { activeRef.current = false; services.controller.setSession(null); }
      setForeground(next === 'active');
    });
    const blur = AppState.addEventListener('blur', () => { activeRef.current = false; services.controller.setSession(null); setWindowFocused(false); });
    const focus = AppState.addEventListener('focus', () => setWindowFocused(true));
    return () => { change.remove(); blur.remove(); focus.remove(); };
  }, [services]);
  useLayoutEffect(() => {
    services.controller.setSession(session);
    if (session) void services.controller.load();
    return () => services.controller.setSession(null);
    // A non-secret generation covers same-account sign-out/sign-in as well as switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, key]);
  const text = { color: dark ? colors.textDark : colors.text };
  const card = { backgroundColor: dark ? colors.cardDark : colors.card };
  const busy = state.status === 'loading' || state.status === 'saving';
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button"
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, { opacity: disabled ? 0.5 : 1 }]}>
    <Text style={{ color: colors.primary }}>{label}</Text></Pressable>;
  return <SafeAreaView style={[styles.root, { backgroundColor: dark ? colors.backgroundDark : colors.background }]}>
    {button(strings.back, () => { services.controller.setSession(null); router.back(); })}
    <Text accessibilityRole="header" style={[styles.title, text]}>{strings.title}</Text>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={text}>{strings.explanation}</Text>
      {!key ? <View><Text style={text}>{auth.status === 'loading' ? strings.loading : strings.unavailable}</Text>
        {auth.status === 'error' && button(strings.retry, () => { void services.binding.refresh(); })}</View> : <>
        {state.notice && <Text accessibilityLiveRegion="polite" style={text}>{state.notice === 'success' ? strings.success : strings.uncertain}</Text>}
        {busy && <ActivityIndicator accessibilityLabel={state.status === 'saving' ? strings.saving : strings.loading} />}
        {state.status === 'error' && <View><Text style={text}>{strings.error}</Text>{button(strings.retry, () => { void services.controller.load(); })}</View>}
        {state.status === 'ready' && state.items.length === 0 && <Text style={text}>{strings.empty}</Text>}
        {state.confirmation && <View style={[styles.card, card]}>
          <Text style={[styles.subtitle, text]}>{strings.confirm}</Text>
          <Text style={text}>{state.confirmation.displayName || state.confirmation.username || strings.fallback}</Text>
          <Text style={text}>{strings.explanation}</Text>
          {button(strings.cancel, services.controller.cancel, busy)}
          {button(state.status === 'saving' ? strings.saving : strings.unblock, () => { void services.controller.confirm(state.confirmation!.confirmationKey); }, busy)}
        </View>}
        {state.items.map(item => <View key={`${key}:${item.userId}`} style={[styles.card, card]}>
          <Text style={[styles.subtitle, text]}>{item.displayName || item.username || strings.fallback}</Text>
          {item.username && <Text style={text}>@{item.username}</Text>}
          {button(strings.unblock, () => services.controller.ask(item.userId), busy || !!state.confirmation || state.status !== 'ready')}
        </View>)}
        {state.hasMore && button(strings.more, () => { void services.controller.load(true); }, busy || !!state.confirmation)}
        {button(strings.refresh, () => { void services.controller.load(); }, busy || !!state.confirmation)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, title: { fontSize: 24, fontWeight: '700', paddingHorizontal: 20 },
  content: { padding: 20, gap: 16 }, card: { padding: 16, borderRadius: 12, gap: 8 },
  subtitle: { fontSize: 17, fontWeight: '600' }, button: { minHeight: 44, padding: 12, justifyContent: 'center' } });
