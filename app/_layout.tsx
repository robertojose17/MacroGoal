
import React, { useEffect, useState } from "react";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  Alert,
  AppState,
  AppStateStatus,
  Platform,
} from "react-native";
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
import { initializeFoodDatabase } from "@/utils/foodDatabase";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Constants from "expo-constants";

import Purchases, { LOG_LEVEL } from "@/utils/purchases";
import mobileAds from "@/utils/mobileAds";

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
      const { Purchases: rc, LOG_LEVEL: ll } = loadPurchases();
      if (rc) {
        (async () => {
          try {
            const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
            const apiKey = Platform.select({
              ios: revenueCatConfig?.iosApiKey,
              android: revenueCatConfig?.androidApiKey,
            });
            if (apiKey && !apiKey.includes("YOUR")) {
              await rc.configure({ apiKey });
              if (__DEV__) await rc.setLogLevel(ll.DEBUG);
              if (resolvedSession?.user?.id) {
                const { customerInfo } = await rc.logIn(
                  resolvedSession.user.id
                );
                console.log(
                  "[App] RevenueCat user identified:",
                  resolvedSession.user.id
                );
                console.log(
                  "[App] Active entitlements:",
                  Object.keys(customerInfo.entitlements.active)
                );
                if (resolvedSession.user.email)
                  await rc.setEmail(resolvedSession.user.email);
              }
            }
          } catch (e) {
            console.warn("[App] RevenueCat init failed (non-blocking):", e);
          }
        })();
      }
    };

    // getSession() races a 3s timeout so a hanging Supabase call never blocks
    // navigation. isReady is set regardless of the outcome.
    const sessionPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error)
          console.warn("[App] getSession error (non-fatal):", error.message);
        return data?.session ?? null;
      });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => {
        console.warn("[App] getSession 3s timeout — proceeding without session");
        resolve(null);
      }, 3000)
    );

    Promise.race([sessionPromise, timeoutPromise])
      .catch(() => null)
      .then((resolvedSession) => {
        if (!mounted) return;
        console.log(
          "[App] Auth init complete. User:",
          resolvedSession?.user?.id ?? "none"
        );
        setSession(resolvedSession);
        setIsReady(true);
        runPostInitSideEffects(resolvedSession);
      });

    // Ongoing auth state changes
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

      if (event === "SIGNED_IN") {
        setSession(newSession);
        hasNavigatedRef.current = false;
        const { Purchases: rc } = loadPurchases();
        if (rc && newSession?.user?.id) {
          rc
            .logIn(newSession.user.id)
            .catch((e: unknown) =>
              console.warn("[App] RC logIn failed:", e)
            );
        }
        return;
      }

      if (event === "SIGNED_OUT") {
        console.log("[Navigation] SIGNED_OUT → /auth/signup");
        setSession(null);
        hasNavigatedRef.current = true;
        const { Purchases: rc } = loadPurchases();
        if (rc) rc.logOut().catch(() => {});
        router.replace("/auth/signup");
        return;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          console.log("[Navigation] Onboarding done → /(tabs)/(home)/");
          router.replace("/(tabs)/(home)/");
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

      if (queryParams?.subscription_success === "true") {
        console.log("[DeepLink] Checkout success detected");
        console.log("[DeepLink] Session ID:", queryParams.session_id);

        Alert.alert(
          "Payment Successful!",
          "Processing your subscription... This will take just a moment.",
          [{ text: "OK" }]
        );

        setTimeout(() => {
          router.replace("/(tabs)/profile");
        }, 300);

        const syncWithRetries = async (
          maxRetries = 10,
          delayMs = 2000
        ) => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(
                `[DeepLink] Sync attempt ${attempt}/${maxRetries}`
              );
              const {
                data: { session: currentSession },
              } = await supabase.auth.getSession();
              if (!currentSession) {
                console.error("[DeepLink] No session found");
                break;
              }

              const { data, error } = await supabase.functions.invoke(
                "sync-subscription",
                {
                  headers: {
                    Authorization: `Bearer ${currentSession.access_token}`,
                  },
                }
              );

              if (error) {
                console.error(
                  `[DeepLink] Sync attempt ${attempt} failed:`,
                  error
                );
              } else {
                console.log(
                  `[DeepLink] Sync attempt ${attempt} succeeded:`,
                  data
                );
              }

              const { data: userData } = await supabase
                .from("users")
                .select("user_type")
                .eq("id", currentSession.user.id)
                .maybeSingle();

              if (userData?.user_type === "premium") {
                console.log("[DeepLink] Premium status confirmed");
                Alert.alert(
                  "Welcome to Premium!",
                  "Your subscription is now active. Enjoy unlimited AI-powered meal estimates and all premium features!",
                  [{ text: "Awesome!" }]
                );
                return;
              }

              if (attempt < maxRetries) {
                await new Promise((resolve) =>
                  setTimeout(resolve, delayMs)
                );
              }
            } catch (error) {
              console.error(
                `[DeepLink] Error in sync attempt ${attempt}:`,
                error
              );
            }
          }

          console.log(
            "[DeepLink] Premium status not confirmed after all retries"
          );
          Alert.alert(
            "Processing...",
            "Your payment is being processed. Premium features will be unlocked shortly.",
            [{ text: "OK" }]
          );
        };

        syncWithRetries().catch((error) => {
          console.error("[DeepLink] Error in syncWithRetries:", error);
        });
      } else if (queryParams?.subscription_cancelled === "true") {
        console.log("[DeepLink] Checkout cancelled");
        setTimeout(() => {
          router.replace("/subscription");
        }, 300);
        Alert.alert(
          "Checkout Cancelled",
          "You can subscribe anytime to unlock premium features.",
          [{ text: "OK" }]
        );
      } else if (queryParams?.subscription_error === "true") {
        console.log("[DeepLink] Subscription error detected");
        setTimeout(() => {
          router.replace("/(tabs)/profile");
        }, 300);
        Alert.alert(
          "Processing Issue",
          "There was an issue processing your payment. Please check your subscription status or contact support if you were charged.",
          [{ text: "OK" }]
        );
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

        const syncTimeout = new Promise<void>((resolve) =>
          setTimeout(resolve, 5000)
        );

        const doSync = async () => {
          try {
            const {
              data: { session: currentSession },
            } = await supabase.auth.getSession();
            if (!currentSession) return;

            const { data, error } = await supabase.functions.invoke(
              "sync-subscription",
              {
                headers: {
                  Authorization: `Bearer ${currentSession.access_token}`,
                },
              }
            );

            if (error) {
              console.error("[AppState] Error syncing subscription:", error);
            } else {
              console.log("[AppState] Subscription synced:", data);
            }
          } catch (error) {
            console.error("[AppState] Error in sync:", error);
          }
        };

        Promise.race([doSync(), syncTimeout]).catch((err) =>
          console.error("[AppState] Sync race error:", err)
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

  return (
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
                  name="add-food-simple"
                  options={{ headerShown: false, presentation: "modal" }}
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
                  name="ai-meal-estimator"
                  options={{ headerShown: false, presentation: "modal" }}
                />
                <Stack.Screen
                  name="my-foods-edit"
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
                    title: "Log Entry",
                  }}
                />
                <Stack.Screen
                  name="tracker/create"
                  options={{
                    presentation: "formSheet",
                    sheetGrabberVisible: true,
                    sheetAllowedDetents: [0.75, 1.0],
                    headerShown: true,
                    title: "New Tracker",
                  }}
                />
              </Stack>
          </WidgetProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
