
import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, Alert, AppState, AppStateStatus } from "react-native";
import { useNetworkState } from "expo-network";
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
import { supabase } from "@/app/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const networkState = useNetworkState();
  const segments = useSegments();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (loaded) {
      initializeApp();
    }
  }, [loaded]);

  const initializeApp = async () => {
    console.log('[App] ========== STARTUP INITIALIZATION ==========');
    
    // CRITICAL: Set a hard timeout for initialization
    const initTimeout = setTimeout(() => {
      console.error('[App] ⏱️ INITIALIZATION TIMEOUT - Forcing app to load');
      setIsReady(true);
      setInitializing(false);
      SplashScreen.hideAsync().catch(e => console.error('[App] Error hiding splash:', e));
    }, 10000); // 10 second hard timeout

    try {
      console.log('[App] Step 1: Initialize food database (non-blocking)');
      
      // CRITICAL FIX: Do NOT await food database initialization
      // Let it run in background, app must load regardless
      initializeFoodDatabase()
        .then(() => console.log('[App] ✅ Food database initialized'))
        .catch(error => console.error('[App] ⚠️ Food database init failed (non-blocking):', error));

      console.log('[App] Step 2: Get current session');
      
      // CRITICAL FIX: Add timeout to session fetch
      const sessionPromise = supabase.auth.getSession();
      const sessionTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
      );
      
      let currentSession: Session | null = null;
      try {
        const { data } = await Promise.race([sessionPromise, sessionTimeout]) as any;
        currentSession = data?.session || null;
        console.log('[App] ✅ Session retrieved:', currentSession?.user?.id || 'none');
      } catch (error) {
        console.error('[App] ⚠️ Session fetch failed (non-blocking):', error);
        currentSession = null;
      }
      
      setSession(currentSession);

      console.log('[App] Step 3: Setup auth listener');
      
      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        console.log('[App] Auth state changed:', _event, session?.user?.id || 'none');
        setSession(session);
      });

      console.log('[App] ✅ Initialization complete');
      
      clearTimeout(initTimeout);
      setIsReady(true);
      setInitializing(false);
      
      // Hide splash screen with error handling
      SplashScreen.hideAsync().catch(e => console.error('[App] Error hiding splash:', e));

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('[App] ❌ CRITICAL: Initialization failed:', error);
      
      // CRITICAL: Even on error, app must load
      clearTimeout(initTimeout);
      setIsReady(true);
      setInitializing(false);
      SplashScreen.hideAsync().catch(e => console.error('[App] Error hiding splash:', e));
    }
  };

  // Handle deep links for Stripe checkout success/cancel
  useEffect(() => {
    console.log('[DeepLink] Setting up deep link listener');

    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DeepLink] Initial URL:', url);
        handleDeepLink(url);
      }
    });

    // Handle deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[DeepLink] Received URL:', event.url);
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = async (url: string) => {
    try {
      console.log('[DeepLink] Processing URL:', url);
      
      const { hostname, path, queryParams } = Linking.parse(url);
      console.log('[DeepLink] Parsed:', { hostname, path, queryParams });

      // Handle checkout success
      if (queryParams?.subscription_success === 'true') {
        console.log('[DeepLink] ✅ Checkout success detected!');
        console.log('[DeepLink] Session ID:', queryParams.session_id);
        
        // Wait a moment for webhook to process
        setTimeout(async () => {
          console.log('[DeepLink] Syncing subscription after checkout...');
          
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              // Call sync-subscription Edge Function
              const { data, error } = await supabase.functions.invoke('sync-subscription', {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });

              if (error) {
                console.error('[DeepLink] Error syncing subscription:', error);
              } else {
                console.log('[DeepLink] ✅ Subscription synced:', data);
              }
            }
          } catch (error) {
            console.error('[DeepLink] Error in sync:', error);
          }

          // Navigate to profile to show updated subscription
          router.replace('/(tabs)/profile');
          
          // Show success message
          Alert.alert(
            '🎉 Welcome to Premium!',
            'Your subscription is now active. Enjoy unlimited AI-powered meal estimates!',
            [{ text: 'OK' }]
          );
        }, 2000);
      }

      // Handle checkout cancel
      if (queryParams?.subscription_cancelled === 'true') {
        console.log('[DeepLink] ❌ Checkout cancelled');
        router.replace('/paywall');
      }
    } catch (error) {
      console.error('[DeepLink] Error handling deep link:', error);
    }
  };

  // Listen for app state changes to sync subscription when returning from background
  useEffect(() => {
    console.log('[AppState] Setting up app state listener');
    
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[AppState] App became active, checking for subscription updates...');
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Sync subscription when app comes to foreground
            const { data, error } = await supabase.functions.invoke('sync-subscription', {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });

            if (error) {
              console.error('[AppState] Error syncing subscription:', error);
            } else {
              console.log('[AppState] ✅ Subscription synced:', data);
            }
          }
        } catch (error) {
          console.error('[AppState] Error in sync:', error);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isReady || initializing) {
      console.log('[Navigation] Waiting for initialization...', { isReady, initializing });
      return;
    }

    const handleNavigation = async () => {
      try {
        const inAuthGroup = segments[0] === 'auth';
        const inOnboardingGroup = segments[0] === 'onboarding';
        const inTabsGroup = segments[0] === '(tabs)';

        console.log('[Navigation] Current state:', { 
          hasSession: !!session, 
          segments, 
          inAuthGroup, 
          inOnboardingGroup, 
          inTabsGroup 
        });

        // Not logged in - redirect to auth
        if (!session) {
          if (!inAuthGroup) {
            console.log('[Navigation] No session, redirecting to welcome');
            router.replace('/auth/welcome');
          }
          return;
        }

        // Logged in - check onboarding status
        if (session && (inAuthGroup || segments.length === 0)) {
          console.log('[Navigation] Checking onboarding status for user:', session.user.id);
          
          // CRITICAL FIX: Add timeout to onboarding check
          const onboardingPromise = supabase
            .from('users')
            .select('onboarding_completed')
            .eq('id', session.user.id)
            .maybeSingle();
          
          const onboardingTimeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Onboarding check timeout')), 5000)
          );
          
          try {
            const { data: userData, error } = await Promise.race([
              onboardingPromise, 
              onboardingTimeout
            ]) as any;

            // CRITICAL FIX: Handle all error cases gracefully
            if (error) {
              console.error('[Navigation] ⚠️ Error checking onboarding (defaulting to onboarding):', error);
              router.replace('/onboarding/complete');
              return;
            }

            // CRITICAL FIX: Handle missing user data (0 rows)
            if (!userData) {
              console.log('[Navigation] ⚠️ User not in database (defaulting to onboarding)');
              router.replace('/onboarding/complete');
              return;
            }

            // User exists, check onboarding status
            if (userData.onboarding_completed) {
              console.log('[Navigation] ✅ Onboarding complete, redirecting to home');
              router.replace('/(tabs)/(home)/');
            } else {
              console.log('[Navigation] ⚠️ Onboarding not complete, redirecting to onboarding');
              router.replace('/onboarding/complete');
            }
          } catch (error) {
            console.error('[Navigation] ❌ Onboarding check failed (defaulting to onboarding):', error);
            // CRITICAL: On any error, default to onboarding (safe fallback)
            router.replace('/onboarding/complete');
          }
        }
      } catch (error) {
        console.error('[Navigation] ❌ CRITICAL: Navigation error:', error);
        // CRITICAL: On catastrophic error, go to welcome screen
        router.replace('/auth/welcome');
      }
    };

    handleNavigation();
  }, [session, segments, isReady, initializing]);

  React.useEffect(() => {
    if (
      !networkState.isConnected &&
      networkState.isInternetReachable === false
    ) {
      Alert.alert(
        "🔌 You are offline",
        "You can keep using the app! Your changes will be saved locally and synced when you are back online."
      );
    }
  }, [networkState.isConnected, networkState.isInternetReachable]);

  if (!loaded || !isReady) {
    return null;
  }

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

  const CustomDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      primary: "rgb(15, 76, 129)",
      background: "rgb(10, 25, 41)",
      card: "rgb(30, 41, 59)",
      text: "rgb(241, 245, 249)",
      border: "rgb(51, 65, 85)",
      notification: "rgb(239, 68, 68)",
    },
  };

  return (
    <>
      <StatusBar style="dark" animated />
      <ThemeProvider
        value={CustomDefaultTheme}
      >
        <WidgetProvider>
          <GestureHandlerRootView>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              
              <Stack.Screen name="auth/welcome" options={{ headerShown: false }} />
              <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ headerShown: false }} />
              
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              
              <Stack.Screen
                name="onboarding/complete"
                options={{
                  headerShown: false,
                  presentation: "card",
                }}
              />
              
              <Stack.Screen
                name="add-food-simple"
                options={{
                  headerShown: false,
                  presentation: "modal",
                }}
              />
              
              <Stack.Screen
                name="add-food"
                options={{
                  headerShown: false,
                  presentation: "modal",
                }}
              />
              
              <Stack.Screen
                name="food-details"
                options={{
                  headerShown: false,
                  presentation: "card",
                }}
              />
              
              <Stack.Screen
                name="barcode-scan"
                options={{
                  headerShown: false,
                  presentation: "fullScreenModal",
                }}
              />
              
              <Stack.Screen
                name="quick-add"
                options={{
                  headerShown: false,
                  presentation: "modal",
                }}
              />
              
              <Stack.Screen
                name="publish"
                options={{
                  headerShown: false,
                  presentation: "modal",
                }}
              />
            </Stack>
            <SystemBars style={"dark"} />
          </GestureHandlerRootView>
        </WidgetProvider>
      </ThemeProvider>
    </>
  );
}
