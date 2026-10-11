import React, { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useProfileScreenServices } from './ProfileScreenEnvironment';
import type { ProfileScreenServices } from './profileScreenServices';
import { createProfileScreenController, emptyProfileScreenState, screenScopeKey } from './profileScreenController';
import { localCalendarDate, profileRangeInput } from './profileScreenPresentation';
import type { NutritionRange } from './profileScreenPresentation';
import { AcceptedSocialProfileScreen } from './AcceptedSocialProfileScreen';

/** No provider means no request, auth listener, cached profile, or mutation. */
export default function AcceptedSocialProfileRoute() {
  const services = useProfileScreenServices();
  const { userId } = useLocalSearchParams<{ userId?: string | string[] }>();
  const router = useRouter();
  const target = typeof userId === 'string' ? userId.toLowerCase() : '';
  if (!services) return <AcceptedSocialProfileScreen state={emptyProfileScreenState()}
    onBack={() => router.back()} unavailable="Profile access is unavailable." />;
  return <ConfiguredProfileRoute key={target} services={services} target={target} onBack={() => router.back()} />;
}

function ConfiguredProfileRoute({ services, target, onBack }: {
  services: ProfileScreenServices; target: string; onBack: () => void;
}) {
  const focused = useIsFocused();
  const [windowFocused, setWindowFocused] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);
  const [range, setRange] = useState<NutritionRange>('today');
  const [calendarNow, setCalendarNow] = useState(() => new Date());
  const [custom, setCustom] = useState(() => ({ fromDate: localCalendarDate(new Date()), toDate: localCalendarDate(new Date()) }));
  const auth = useSyncExternalStore(services.binding.subscribe, services.binding.getSnapshot, services.binding.getSnapshot);
  const controller = useMemo(() => createProfileScreenController(services.createAdapter, services.createSupplements), [services]);
  const observed = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const input = profileRangeInput(target, range, calendarNow, custom);
  const active = focused && windowFocused && appState === 'active';
  const scope = active && auth.session && input ? { session: auth.session, profile: input } : null;
  const scopeKey = screenScopeKey(scope);
  // Never render previous-account, target, range, blurred or background data while effects catch up.
  const state = observed.scopeKey === scopeKey ? observed : emptyProfileScreenState(scopeKey);

  useLayoutEffect(() => { services.binding.start(); return services.binding.stop; }, [services]);
  useLayoutEffect(() => {
    const subscription = AppState.addEventListener('change', next => { setAppState(next); if (next === 'active') setCalendarNow(new Date()); });
    const blur = AppState.addEventListener('blur', () => setWindowFocused(false));
    const focus = AppState.addEventListener('focus', () => { setWindowFocused(true); setCalendarNow(new Date()); });
    return () => { subscription.remove(); blur.remove(); focus.remove(); };
  }, []);
  useLayoutEffect(() => { if (focused) setCalendarNow(new Date()); }, [focused]);
  useLayoutEffect(() => {
    controller.setScope(scope);
    return () => controller.setScope(null); // Reusable on StrictMode replay, blur, logout and unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, scopeKey]);
  const refresh = useCallback(() => {
    const next = new Date();
    if (localCalendarDate(next) !== localCalendarDate(calendarNow)) setCalendarNow(next);
    else void controller.refresh();
  }, [controller, calendarNow]);
  const unavailable = !active ? 'Profile hidden while this screen is inactive.' :
    auth.status === 'loading' ? 'Checking your account…' : !auth.session ? 'Sign in to view this profile.' :
    !input ? 'This profile or date range is unavailable.' : undefined;
  return <AcceptedSocialProfileScreen state={state} onBack={onBack} unavailable={unavailable}
    range={range} custom={custom} onRefresh={refresh}
    onRange={next => { setCalendarNow(new Date()); setRange(next); }}
    onCustom={(fromDate, toDate) => {
      if (!profileRangeInput(target, 'custom', new Date(), { fromDate, toDate })) return false;
      setCustom({ fromDate, toDate }); setCalendarNow(new Date()); setRange('custom'); return true;
    }} onAction={action => { void controller.change(action); }}
    onConnections={direction => { void controller.openConnections(direction); }} onCloseConnections={controller.closeConnections}
    onBlockConfirm={key => { void controller.block(key).then(confirmed => { if (confirmed) onBack(); }); }} />;
}
