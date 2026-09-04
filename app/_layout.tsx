
import '@/lib/i18n';
import i18n from '@/lib/i18n';
import React, { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  AppState,
  AppStateStatus,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { initializeFoodDatabase } from "@/utils/foodDatabase";
import { supabase } from "@/lib/supabase/client";
import { reportTodaySteps } from "@/utils/stepsReporter";
import { setUserTimezone } from "@/utils/macroXpApi";
import type { Session } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import GoPremiumFloatingBadge from "@/components/GoPremiumFloatingBadge";
import Constants from "expo-constants";
import { trackOnboardingEvent } from "@/utils/onboardingAnalytics";
import { toLocalDateString } from "@/utils/dateUtils";
import WelcomeBackModal from "@/components/WelcomeBackModal";
import Purchases, { LOG_LEVEL, isPurchasesAvailable, loginRevenueCat, logoutRevenueCat } from "@/utils/purchases";
import { AFFILIATE_CODE_STORAGE_KEY, setRevenueCatAffiliateCode } from "@/utils/affiliateApi";
import mobileAds from "@/utils/mobileAds";

// GestureHandlerRootView — native only
let GestureHandlerRootView: any = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView = require("react-native-gesture-handler").GestureHandlerRootView;
  } catch {}
}

// OneSignal — native only, not available in Expo Go
const isExpoGo = Constants.appOwnership === "expo";
let OneSignal: any = null;
if (Platform.OS !== "web" && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    OneSignal = require("react-native-onesignal").OneSignal;
  } catch (e) {
    console.warn("[OneSignal] Failed to load react-native-onesignal:", e);
  }
}

const TIMEZONE_STORAGE_KEY = "user_timezone_synced";

function loadPurchases(): { Purchases: any; LOG_LEVEL: any } {
  return { Purchases, LOG_LEVEL };
}

function loadMobileAds(): any {
  return mobileAds;
}

// Prevent auto-hide — we will call hideAsync() immediately on mount.
try {
  SplashScreen.preventAutoHideAsync();
} catch {
  // Already hidden or not available — ignore
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const hasNavigatedRef = React.useRef(false);
  const appOpenedTrackedRef = React.useRef(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeBackUserId, setWelcomeBackUserId] = useState('');

  // ─── Issue 1 fix: hide splash immediately on mount, no waiting ───────────
  useEffect(() => {
    console.log("[SplashScreen] Hiding splash screen immediately on mount");
    SplashScreen.hideAsync().catch((e) =>
      console.warn("[SplashScreen] hideAsync error (non-fatal):", e)
    );
  }, []);

  // ─── Auth init ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const runPostInitSideEffects = (resolvedSession: Session | null) => {
      // Non-blocking: food database
      initializeFoodDatabase().catch((e) =>
        console.warn("[App] Food DB init failed:", e)
      );

      // Non-blocking: AdMob
      const mobileAdsInstance = loadMobileAds();
      if (mobileAdsInstance) {
        mobileAdsInstance
          .initialize()
          .then(() => console.log("[App] AdMob initialized"))
          .catch((err: unknown) =>
            console.warn("[App] AdMob init failed (non-blocking):", err)
          );
      }

      // Non-blocking: RevenueCat (native only)
      if (isPurchasesAvailable) {
        const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
        const apiKey = Platform.select({
          ios: revenueCatConfig?.iosApiKey,
          android: revenueCatConfig?.androidApiKey,
        });
        if (apiKey && !apiKey.includes("YOUR")) {
          if (resolvedSession?.user?.id) {
            // Configure AND identify atomically — no anonymous window.
            loginRevenueCat(resolvedSession.user.id, apiKey, { email: resolvedSession.user.email ?? undefined })
              .then(() => {
                // Re-apply any previously validated affiliate code as an RC subscriber attribute
                return AsyncStorage.getItem(AFFILIATE_CODE_STORAGE_KEY).then((savedCode) => {
                  if (savedCode) {
                    console.log("[App] Restoring RC $affiliate_code attribute from storage:", savedCode);
                    return setRevenueCatAffiliateCode(savedCode);
                  }
                });
              })
              .catch((e) => console.warn("[App] loginRevenueCat / affiliate attribute restore failed:", e));
          } else {
            // No session yet — INITIAL_SESSION listener below will handle it.
            console.log("[App] No session at cold start — deferring RC login to auth listener");
          }
          if (__DEV__) {
            try { Purchases.setLogLevel(LOG_LEVEL.DEBUG); } catch (_) {}
          }
        }
      }
    };

    // hasResolved prevents double-calls when both INITIAL_SESSION and
    // getSession() resolve before the 800ms timeout fires.
    let hasResolved = false;

    const resolve = (resolvedSession: Session | null, source: string) => {
      if (!mounted || hasResolved) return;
      hasResolved = true;
      console.log(
        `[App] Auth init complete (via ${source}). User:`,
        resolvedSession?.user?.id ?? "none"
      );
      setSession(resolvedSession);
      setIsReady(true);
      if (!appOpenedTrackedRef.current) {
        appOpenedTrackedRef.current = true;
        trackOnboardingEvent('app_opened');
      }
      runPostInitSideEffects(resolvedSession);

      // One-time backfill: populate translations column for existing records
      if (resolvedSession) {
        AsyncStorage.getItem('backfill_translations_done').then((done) => {
          if (!done) {
            console.log('[App] Triggering backfill-translations edge function');
            supabase.functions.invoke('backfill-translations').then(() => {
              AsyncStorage.setItem('backfill_translations_done', '1');
              console.log('[App] backfill-translations complete');
            }).catch((e) => console.warn('[App] backfill-translations failed (non-fatal):', e));
          }
        }).catch(() => {});
      }
    };

    // Hard timeout — 800ms max wait regardless of what else resolves.
    const timeoutId = setTimeout(() => {
      console.warn("[App] Auth init 800ms timeout — proceeding without session");
      resolve(null, "timeout");
    }, 800);

    // Parallel fallback: getSession() — resolves before timeout on a warm network.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error)
          console.warn("[App] getSession error (non-fatal):", error.message);
        resolve(data?.session ?? null, "getSession");
      })
      .catch(() => resolve(null, "getSession-catch"));

    // Primary: onAuthStateChange INITIAL_SESSION fires synchronously on iOS
    // when a cached session exists — this is the fastest path.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      console.log(
        "[App] Auth event:",
        event,
        "User:",
        newSession?.user?.id || "none"
      );

      if (event === "INITIAL_SESSION") {
        clearTimeout(timeoutId);
        resolve(newSession, "INITIAL_SESSION");
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(newSession);
        if (event === "SIGNED_IN") hasNavigatedRef.current = false;

        if (newSession?.user?.id) {
          const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
          const apiKey = Platform.select({
            ios: revenueCatConfig?.iosApiKey,
            android: revenueCatConfig?.androidApiKey,
          });
          if (apiKey && !apiKey.includes("YOUR")) {
            loginRevenueCat(newSession.user.id, apiKey, { email: newSession.user.email ?? undefined })
              .catch((e) => console.warn("[App] loginRevenueCat (auth event) failed:", e));
          }
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        console.log("[Navigation] SIGNED_OUT → /auth/signup");
        setSession(null);
        hasNavigatedRef.current = true;
        logoutRevenueCat().catch((e) => console.warn("[App] logoutRevenueCat failed:", e));
        router.replace("/auth/signup");
        return;
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Timezone sync ────────────────────────────────────────────────────────
  // Fire-and-forget: sync the device timezone to the backend once per change.
  // Runs whenever the session becomes available (i.e. user is signed in).
  useEffect(() => {
    if (!session) return;

    const syncTimezone = async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        console.log("[Layout] timezone sync — device timezone:", tz);

        const cached = await AsyncStorage.getItem(TIMEZONE_STORAGE_KEY);
        if (cached === tz) {
          console.log("[Layout] timezone sync — already synced, skipping");
          return;
        }

        console.log("[Layout] timezone sync — sending to backend:", tz);
        await setUserTimezone(tz);
        await AsyncStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
        console.log("[Layout] timezone sync — success, cached:", tz);
      } catch (e) {
        console.warn("[Layout] timezone sync failed (non-fatal):", e);
      }
    };

    syncTimezone();
  }, [session]);

  // ─── Timezone resync on foreground ────────────────────────────────────────
  // If the user travels to a new timezone while the app is backgrounded,
  // re-sync when they bring the app back to the foreground.
  useEffect(() => {
    if (!session) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const cached = await AsyncStorage.getItem(TIMEZONE_STORAGE_KEY);
        if (cached === tz) return; // unchanged, skip
        console.log('[Layout] timezone resync on foreground — sending:', tz);
        await setUserTimezone(tz);
        await AsyncStorage.setItem(TIMEZONE_STORAGE_KEY, tz);
      } catch (e) {
        console.warn('[Layout] timezone resync (AppState) failed:', e);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [session]);

  // ─── Navigation guard ─────────────────────────────────────────────────────
  // Runs once isReady flips to true. Does NOT wait for segments — on cold
  // start segments is [] which caused the old guard to bail and leave the
  // blank index.tsx spinner on screen forever.
  useEffect(() => {
    if (!isReady) return;
    if (hasNavigatedRef.current) return;

    console.log("[Navigation] isReady=true, session:", session?.user?.id ?? "none");

    const navigate = async () => {
      // No session → go to auth immediately, no DB query needed.
      if (!session) {
        console.log("[Navigation] No session → /auth/signup");
        hasNavigatedRef.current = true;
        router.replace("/auth/signup");
        return;
      }

      // Has session → check onboarding status, with a 3s safety timeout.
      try {
        console.log("[Navigation] Session found, checking onboarding status...");
        const result = await Promise.race([
          supabase
            .from("users")
            .select("onboarding_completed")
            .eq("id", session.user.id)
            .maybeSingle(),
          new Promise<{ data: null; error: Error }>((resolve) =>
            setTimeout(
              () => resolve({ data: null, error: new Error("timeout") }),
              3000
            )
          ),
        ]);

        if (!result.data || result.error) {
          console.log("[Navigation] No user row or timeout → /onboarding/complete");
          router.replace("/onboarding/complete");
        } else if (result.data.onboarding_completed) {
          // ── Gap detection: check if user has been away 30+ days ──────────
          try {
            const { data: gapData } = await supabase
              .from('users')
              .select('last_app_open')
              .eq('id', session.user.id)
              .maybeSingle();

            if (gapData?.last_app_open) {
              const lastOpen = new Date(gapData.last_app_open + 'T00:00:00');
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const diffDays = Math.floor(
                (today.getTime() - lastOpen.getTime()) / (1000 * 60 * 60 * 24)
              );
              console.log('[Navigation] Days since last app open:', diffDays);
              if (diffDays >= 30) {
                console.log('[Navigation] Gap detected:', diffDays, 'days — showing welcome back modal');
                setWelcomeBackUserId(session.user.id);
                setShowWelcomeBack(true);
              }
            } else {
              console.log('[Navigation] last_app_open is null — new user or first time, skipping gap check');
            }

            // Always update last_app_open (fire and forget)
            supabase
              .from('users')
              .update({ last_app_open: toLocalDateString(new Date()) })
              .eq('id', session.user.id)
              .then(() => console.log('[Navigation] last_app_open updated'))
              .catch((e: unknown) => console.warn('[Navigation] last_app_open update failed:', e));
          } catch (gapErr) {
            console.warn('[Navigation] Gap check failed (non-fatal):', gapErr);
          }
          // ─────────────────────────────────────────────────────────────────

          const firstLaunchDone = await AsyncStorage.getItem(`first_launch_done_${session.user.id}`);
          if (!firstLaunchDone) {
            console.log("[Navigation] First launch after onboarding → /(tabs)/coach");
            await AsyncStorage.setItem(`first_launch_done_${session.user.id}`, 'true');
            router.replace('/(tabs)/coach');
          } else {
            console.log("[Navigation] Onboarding done → /(tabs)/(home)/");
            router.replace("/(tabs)/(home)/");
          }
        } else {
          console.log("[Navigation] Onboarding incomplete → /onboarding/complete");
          router.replace("/onboarding/complete");
        }
      } catch (e) {
        console.error("[Navigation] Unexpected error, falling back to home:", e);
        router.replace("/(tabs)/(home)/");
      }
      hasNavigatedRef.current = true;
    };

    navigate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, session]);

  // ─── OneSignal notification click handler ────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web" || !OneSignal) return;

    const clickHandler = (event: any) => {
      const data = event?.notification?.additionalData as
        | { screen?: string; action?: string }
        | undefined;
      console.log("[OneSignal] Notification clicked — data:", data);
      if (!data) return;
      if (data.screen === "dashboard" || data.screen === "missions") {
        console.log("[OneSignal] Deep linking to dashboard");
        router.push("/(tabs)/dashboard");
      }
    };

    OneSignal.Notifications.addEventListener("click", clickHandler);
    return () => {
      OneSignal.Notifications.removeEventListener("click", clickHandler);
    };
  }, []);

  // ─── Deep link handler ────────────────────────────────────────────────────
  useEffect(() => {
    console.log("[DeepLink] Setting up deep link listener");

    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log("[DeepLink] Initial URL:", url);
        handleDeepLink(url);
      }
    });

    const subscription = Linking.addEventListener("url", (event) => {
      console.log("[DeepLink] Received URL:", event.url);
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    try {
      console.log("[DeepLink] Processing URL:", url);
      const { hostname, path, queryParams } = Linking.parse(url);
      console.log("[DeepLink] Parsed:", { hostname, path, queryParams });

      // Widget quick-action deep links
      // macrogoal://food-search  → hostname="food-search"
      // macrogoal://barcode-scanner → hostname="barcode-scanner"
      // macrogoal://quick-add → hostname="quick-add"
      const action = hostname || path?.replace(/^\//, "");

      if (action === "food-search") {
        console.log("[DeepLink] Navigating to /food-search");
        router.push("/food-search");
      } else if (action === "barcode-scanner") {
        console.log("[DeepLink] Navigating to /barcode-scanner");
        router.push("/barcode-scanner");
      } else if (action === "quick-add") {
        console.log("[DeepLink] Navigating to /my-foods-create");
        router.push("/my-foods-create");
      }
    } catch (error) {
      console.error("[DeepLink] Error handling deep link:", error);
    }
  };

  // ─── App state listener (subscription sync on foreground) ─────────────────
  useEffect(() => {
    console.log("[AppState] Setting up app state listener");
    let previousAppState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState: AppStateStatus) => {
        const wasBackground =
          previousAppState === "background" ||
          previousAppState === "inactive";
        const isNowActive = nextAppState === "active";
        previousAppState = nextAppState;

        if (!wasBackground || !isNowActive) return;

        console.log(
          "[AppState] App foregrounded, checking for subscription updates..."
        );

        // Non-blocking: report today's steps to the XP system (throttled to once/30 min)
        reportTodaySteps().catch((e) =>
          console.warn("[AppState] reportTodaySteps error (non-fatal):", e)
        );
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // ─── Theme ────────────────────────────────────────────────────────────────
  const CustomDefaultTheme: Theme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      primary: "rgb(15, 76, 129)",
      background: "rgb(255, 255, 255)",
      card: "rgb(248, 250, 252)",
      text: "rgb(30, 41, 59)",
      border: "rgb(226, 232, 240)",
      notification: "rgb(239, 68, 68)",
    },
  };

  const content = (
    <NotificationProvider>
      <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="dark" animated />
        <ThemeProvider value={CustomDefaultTheme}>
          <WidgetProvider>
            <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />

                <Stack.Screen
                  name="auth/signup"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="auth/login"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="auth/verify"
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="auth/welcome"
                  options={{ headerShown: false }}
                />

                <Stack.Screen
                  name="(tabs)"
                  options={{ headerShown: false }}
                />

                <Stack.Screen
                  name="onboarding/complete"
                  options={{ headerShown: false, presentation: "card" }}
                />


                <Stack.Screen
                  name="add-food"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="food-details"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="food-search"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="my-foods"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="barcode-lookup"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="copy-from-previous"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="my-foods-edit"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="edit-saved-meal-item"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="my-foods-create"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="barcode-scanner"
                  options={{
                    headerShown: false,
                    presentation: "fullScreenModal",
                  }}
                />
                <Stack.Screen
                  name="custom-macros"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="subscription"
                  options={{ headerShown: false, presentation: "modal" }}
                />

                <Stack.Screen
                  name="meal-plan-create"
                  options={{ headerShown: false, presentation: "fullScreenModal" }}
                />

                <Stack.Screen
                  name="tracker/[id]"
                  options={{
                    headerShown: true,
                    headerBackButtonDisplayMode: "minimal",
                    title: "",
                  }}
                />
                <Stack.Screen
                  name="tracker/log"
                  options={{
                    presentation: "formSheet",
                    sheetGrabberVisible: true,
                    sheetAllowedDetents: [0.5, 0.75],
                    headerShown: true,
                    title: i18n.t('tracker.logEntry'),
                  }}
                />
                <Stack.Screen
                  name="tracker/create"
                  options={{
                    presentation: "formSheet",
                    sheetGrabberVisible: true,
                    sheetAllowedDetents: [0.75, 1.0],
                    headerShown: true,
                    title: i18n.t('tracker.newTracker'),
                  }}
                />
                <Stack.Screen
                  name="consistency-detail"
                  options={{
                    headerShown: true,
                    headerBackButtonDisplayMode: 'minimal',
                    title: i18n.t('nav.consistencyScore'),
                  }}
                />
                <Stack.Screen
                  name="progress-detail"
                  options={{
                    headerShown: true,
                    headerBackButtonDisplayMode: 'minimal',
                    title: i18n.t('nav.weightProgress'),
                  }}
                />
                <Stack.Screen
                  name="referrals"
                  options={{
                    headerShown: true,
                    headerBackButtonDisplayMode: 'minimal',
                    title: i18n.t('nav.inviteFriends'),
                  }}
                />
                <Stack.Screen
                  name="affiliate-apply"
                  options={{
                    headerShown: true,
                    headerBackButtonDisplayMode: 'minimal',
                    title: i18n.t('nav.affiliateApplication'),
                  }}
                />
                <Stack.Screen
                  name="affiliate-welcome"
                  options={{ title: i18n.t('nav.creatorProgram'), headerShown: false }}
                />
                <Stack.Screen
                  name="affiliate-admin"
                  options={{ title: i18n.t('nav.affiliateAdmin'), headerShown: true }}
                />
              </Stack>
          </WidgetProvider>
        </ThemeProvider>

        <GoPremiumFloatingBadge />
        <WelcomeBackModal
          visible={showWelcomeBack}
          userId={welcomeBackUserId}
          onDismiss={() => {
            console.log('[Layout] WelcomeBackModal dismissed');
            setShowWelcomeBack(false);
          }}
        />
      </SafeAreaProvider>
    </ErrorBoundary>
    </NotificationProvider>
  );

  return GestureHandlerRootView ? (
    <GestureHandlerRootView style={{ flex: 1 }}>{content}</GestureHandlerRootView>
  ) : content;
}
