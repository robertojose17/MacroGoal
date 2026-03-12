
import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import { Stack, router, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, Alert, AppState, AppStateStatus, Platform } from "react-native";
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
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import Constants from "expo-constants";

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const networkState = useNetworkState();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasNavigated, setHasNavigated] = useState(false);

  // Initialize app and auth
  useEffect(() => {
    if (loaded) {
      initializeApp();
    }
  }, [loaded]);

  const initializeApp = async () => {
    console.log('[App] ========== STARTUP INITIALIZATION ==========');
    
    try {
      console.log('[App] Step 1: Initialize food database (non-blocking)');
      
      // Let food database init run in background
      initializeFoodDatabase()
        .then(() => console.log('[App] ✅ Food database initialized'))
        .catch(error => console.error('[App] ⚠️ Food database init failed (non-blocking):', error));

      console.log('[App] Step 2: Get current session');
      
      const { data } = await supabase.auth.getSession();
      const currentSession = data?.session || null;
      console.log('[App] ✅ Session retrieved:', currentSession?.user?.id || 'none');
      
      setSession(currentSession);

      console.log('[App] Step 3: Initialize RevenueCat (native only)');
      
      // Initialize RevenueCat on native platforms
      if (Platform.OS !== 'web') {
        try {
          const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
          const apiKey = Platform.select({
            ios: revenueCatConfig?.iosApiKey,
            android: revenueCatConfig?.androidApiKey,
          });

          if (apiKey && !apiKey.includes('YOUR')) {
            // CRITICAL: Configure RevenueCat WITHOUT an initial appUserID
            // This allows each user to be identified separately when they log in
            console.log('[App] Configuring RevenueCat with anonymous user (will identify on login)');
            
            await Purchases.configure({
              apiKey,
              // DO NOT set appUserID here - let RevenueCat create an anonymous ID
              // We'll call Purchases.logIn() when the user authenticates
            });

            // Enable debug logs in development
            if (__DEV__) {
              await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
            }

            console.log('[App] ✅ RevenueCat initialized (anonymous)');

            // If we already have a session, identify the user immediately
            if (currentSession?.user?.id) {
              console.log('[App] Current session found, identifying user with RevenueCat');
              try {
                const { customerInfo } = await Purchases.logIn(currentSession.user.id);
                console.log('[App] ✅ User identified with RevenueCat:', currentSession.user.id);
                console.log('[App] Active entitlements:', Object.keys(customerInfo.entitlements.active));
                
                // CRITICAL: Set user attributes (email and display name) for RevenueCat dashboard
                console.log('[App] 📝 Setting user attributes for RevenueCat dashboard...');
                const userEmail = currentSession.user.email;
                
                // Get user's name from the users table
                const { data: userData } = await supabase
                  .from('users')
                  .select('email')
                  .eq('id', currentSession.user.id)
                  .maybeSingle();

                if (userEmail) {
                  await Purchases.setEmail(userEmail);
                  console.log('[App] ✅ Email set in RevenueCat:', userEmail);
                }

                // Set display name (use email username as display name if no name available)
                const displayName = userData?.email || userEmail?.split('@')[0] || 'User';
                await Purchases.setDisplayName(displayName);
                console.log('[App] ✅ Display name set in RevenueCat:', displayName);
                
                // CRITICAL: Force a customer info refresh to ensure we have the latest data
                console.log('[App] 🔄 Refreshing customer info to get latest subscription status...');
                const refreshedInfo = await Purchases.getCustomerInfo();
                console.log('[App] ✅ Customer info refreshed');
                console.log('[App] Active entitlements after refresh:', Object.keys(refreshedInfo.entitlements.active));
              } catch (loginError) {
                console.error('[App] ⚠️ Failed to identify user with RevenueCat:', loginError);
              }
            }
          } else {
            console.log('[App] ⚠️ RevenueCat API keys not configured - skipping initialization');
          }
        } catch (revenueCatError) {
          console.error('[App] ⚠️ RevenueCat initialization failed (non-blocking):', revenueCatError);
        }
      }

      console.log('[App] Step 4: Setup auth listener');
      
      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[App] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('[App] Auth state changed:', event);
        console.log('[App] User ID:', session?.user?.id || 'none');
        console.log('[App] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        setSession(session);

        // Update RevenueCat user ID when auth state changes (native only)
        if (Platform.OS !== 'web') {
          if (event === 'SIGNED_IN' && session?.user?.id) {
            // User logged in - identify them with RevenueCat
            try {
              console.log('[App] 🔐 User signed in, identifying with RevenueCat:', session.user.id);
              const { customerInfo } = await Purchases.logIn(session.user.id);
              console.log('[App] ✅ RevenueCat user identified:', session.user.id);
              console.log('[App] Active entitlements:', Object.keys(customerInfo.entitlements.active));
              console.log('[App] Original App User ID:', customerInfo.originalAppUserId);
              
              // CRITICAL: Set user attributes (email and display name) for RevenueCat dashboard
              console.log('[App] 📝 Setting user attributes for RevenueCat dashboard...');
              const userEmail = session.user.email;
              
              // Get user's name from the users table
              const { data: userData } = await supabase
                .from('users')
                .select('email')
                .eq('id', session.user.id)
                .maybeSingle();

              if (userEmail) {
                await Purchases.setEmail(userEmail);
                console.log('[App] ✅ Email set in RevenueCat:', userEmail);
              }

              // Set display name (use email username as display name if no name available)
              const displayName = userData?.email || userEmail?.split('@')[0] || 'User';
              await Purchases.setDisplayName(displayName);
              console.log('[App] ✅ Display name set in RevenueCat:', displayName);
              
              // CRITICAL: Force a customer info refresh to ensure we have the latest data
              console.log('[App] 🔄 Refreshing customer info to get latest subscription status...');
              const refreshedInfo = await Purchases.getCustomerInfo();
              console.log('[App] ✅ Customer info refreshed');
              console.log('[App] Active entitlements after refresh:', Object.keys(refreshedInfo.entitlements.active));
            } catch (error) {
              console.error('[App] ❌ Failed to identify user with RevenueCat:', error);
            }
          } else if (event === 'SIGNED_OUT') {
            // User logged out - reset RevenueCat to anonymous
            try {
              console.log('[App] 🚪 User signed out, resetting RevenueCat to anonymous');
              const { customerInfo } = await Purchases.logOut();
              console.log('[App] ✅ RevenueCat user logged out (now anonymous)');
              console.log('[App] New anonymous ID:', customerInfo.originalAppUserId);
            } catch (error) {
              console.error('[App] ⚠️ Failed to log out RevenueCat user:', error);
            }
          } else if (event === 'TOKEN_REFRESHED' && session?.user?.id) {
            // Token refreshed - ensure user is still identified
            try {
              console.log('[App] 🔄 Token refreshed, verifying RevenueCat user ID');
              const currentInfo = await Purchases.getCustomerInfo();
              
              // Check if the current RevenueCat user matches the session user
              if (currentInfo.originalAppUserId !== session.user.id) {
                console.log('[App] ⚠️ RevenueCat user ID mismatch, re-identifying');
                console.log('[App] Expected:', session.user.id);
                console.log('[App] Current:', currentInfo.originalAppUserId);
                
                const { customerInfo } = await Purchases.logIn(session.user.id);
                console.log('[App] ✅ RevenueCat user re-identified:', session.user.id);
                console.log('[App] Active entitlements:', Object.keys(customerInfo.entitlements.active));
                
                // Re-set user attributes
                const userEmail = session.user.email;
                const { data: userData } = await supabase
                  .from('users')
                  .select('email')
                  .eq('id', session.user.id)
                  .maybeSingle();

                if (userEmail) {
                  await Purchases.setEmail(userEmail);
                }
                const displayName = userData?.email || userEmail?.split('@')[0] || 'User';
                await Purchases.setDisplayName(displayName);
                console.log('[App] ✅ User attributes re-set');
              } else {
                console.log('[App] ✅ RevenueCat user ID matches session');
              }
            } catch (error) {
              console.error('[App] ⚠️ Failed to verify RevenueCat user ID:', error);
            }
          }
        }
      });

      console.log('[App] ✅ Initialization complete');
      setIsReady(true);
      
      // Hide splash screen
      setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
          console.log('[App] ✅ Splash screen hidden');
        } catch (e) {
          console.error('[App] Error hiding splash:', e);
        }
      }, 300);

    } catch (error) {
      console.error('[App] ❌ CRITICAL: Initialization failed:', error);
      
      // Even on error, app must load
      setIsReady(true);
      
      setTimeout(async () => {
        try {
          await SplashScreen.hideAsync();
        } catch (e) {
          console.error('[App] Error hiding splash:', e);
        }
      }, 300);
    }
  };

  // Handle navigation based on auth state
  useEffect(() => {
    if (!isReady || !navigationState?.key) {
      console.log('[Navigation] Not ready yet, waiting...');
      return;
    }

    if (hasNavigated) {
      console.log('[Navigation] Already navigated, skipping');
      return;
    }

    const handleNavigation = async () => {
      console.log('[Navigation] ========== CHECKING AUTH STATE ==========');
      console.log('[Navigation] Current segments:', segments);
      console.log('[Navigation] Session:', session?.user?.id || 'none');

      const inAuthGroup = segments[0] === 'auth';
      const inTabsGroup = segments[0] === '(tabs)';
      const inOnboarding = segments[0] === 'onboarding';

      // If no session, ensure we're in auth flow
      if (!session) {
        if (!inAuthGroup) {
          console.log('[Navigation] No session, redirecting to welcome');
          setHasNavigated(true);
          router.replace('/auth/welcome');
        }
        return;
      }

      // If we have a session, check onboarding status
      console.log('[Navigation] Session found, checking onboarding...');
      
      try {
        const { data: userData, error } = await supabase
          .from('users')
          .select('onboarding_completed')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error || !userData) {
          console.log('[Navigation] User data not found, redirecting to onboarding');
          if (!inOnboarding) {
            setHasNavigated(true);
            router.replace('/onboarding/complete');
          }
          return;
        }

        if (userData.onboarding_completed) {
          console.log('[Navigation] Onboarding complete, redirecting to home');
          if (!inTabsGroup) {
            setHasNavigated(true);
            router.replace('/(tabs)/(home)/');
          }
        } else {
          console.log('[Navigation] Onboarding incomplete, redirecting to onboarding');
          if (!inOnboarding) {
            setHasNavigated(true);
            router.replace('/onboarding/complete');
          }
        }
      } catch (error) {
        console.error('[Navigation] Error checking onboarding:', error);
      }

      console.log('[Navigation] ========== NAVIGATION CHECK COMPLETE ==========');
    };

    // Small delay to ensure navigation is ready
    const timer = setTimeout(handleNavigation, 100);
    return () => clearTimeout(timer);
  }, [isReady, session, segments, navigationState, hasNavigated]);

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
      console.log('[DeepLink] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[DeepLink] Processing URL:', url);
      
      const { hostname, path, queryParams } = Linking.parse(url);
      console.log('[DeepLink] Parsed:', { hostname, path, queryParams });

      // Handle checkout success
      if (queryParams?.subscription_success === 'true') {
        console.log('[DeepLink] ✅ Checkout success detected!');
        console.log('[DeepLink] Session ID:', queryParams.session_id);
        
        // Show immediate feedback
        Alert.alert(
          '✅ Payment Successful!',
          'Processing your subscription... This will take just a moment.',
          [{ text: 'OK' }]
        );
        
        // Navigate to profile with proper delay
        setTimeout(() => {
          router.replace('/(tabs)/profile');
        }, 300);
        
        // Sync subscription in background with retries
        console.log('[DeepLink] 🔄 Starting subscription sync with retries...');
        
        const syncWithRetries = async (maxRetries = 10, delayMs = 2000) => {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`[DeepLink] 🔄 Sync attempt ${attempt}/${maxRetries}`);
              
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                console.error('[DeepLink] ❌ No session found');
                break;
              }

              // Call sync-subscription Edge Function
              const { data, error } = await supabase.functions.invoke('sync-subscription', {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              });

              if (error) {
                console.error(`[DeepLink] ⚠️ Sync attempt ${attempt} failed:`, error);
              } else {
                console.log(`[DeepLink] ✅ Sync attempt ${attempt} succeeded:`, data);
              }

              // Check if user is now premium
              const { data: userData } = await supabase
                .from('users')
                .select('user_type')
                .eq('id', session.user.id)
                .maybeSingle();

              if (userData?.user_type === 'premium') {
                console.log('[DeepLink] 🎉 Premium status confirmed!');
                
                // Show success message
                Alert.alert(
                  '🎉 Welcome to Premium!',
                  'Your subscription is now active. Enjoy unlimited AI-powered meal estimates and all premium features!',
                  [{ text: 'Awesome!' }]
                );
                
                return; // Success, stop retrying
              }

              // Wait before next retry
              if (attempt < maxRetries) {
                console.log(`[DeepLink] ⏳ Waiting ${delayMs}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            } catch (error) {
              console.error(`[DeepLink] ❌ Error in sync attempt ${attempt}:`, error);
            }
          }

          // If we get here, all retries failed
          console.log('[DeepLink] ⚠️ Premium status not confirmed after all retries');
          Alert.alert(
            'Processing...',
            'Your payment is being processed. Premium features will be unlocked shortly. If this takes more than a few minutes, please contact support.',
            [{ text: 'OK' }]
          );
        };

        // Run sync in background
        syncWithRetries().catch(error => {
          console.error('[DeepLink] ❌ Error in syncWithRetries:', error);
        });
      }

      // Handle checkout cancel
      else if (queryParams?.subscription_cancelled === 'true') {
        console.log('[DeepLink] ❌ Checkout cancelled');
        setTimeout(() => {
          router.replace('/subscription');
        }, 300);
        Alert.alert(
          'Checkout Cancelled',
          'You can subscribe anytime to unlock premium features.',
          [{ text: 'OK' }]
        );
      }

      // Handle subscription error
      else if (queryParams?.subscription_error === 'true') {
        console.log('[DeepLink] ⚠️ Subscription error detected');
        setTimeout(() => {
          router.replace('/(tabs)/profile');
        }, 300);
        Alert.alert(
          'Processing Issue',
          'There was an issue processing your payment. Please check your subscription status or contact support if you were charged.',
          [{ text: 'OK' }]
        );
      }

      console.log('[DeepLink] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('[DeepLink] ❌ Error handling deep link:', error);
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
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" animated />
        <ThemeProvider value={CustomDefaultTheme}>
          <WidgetProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              
              <Stack.Screen name="auth/welcome" options={{ headerShown: false }} />
              <Stack.Screen name="auth/signup" options={{ headerShown: false }} />
              <Stack.Screen name="auth/login" options={{ headerShown: false }} />
              <Stack.Screen name="auth/verify" options={{ headerShown: false }} />
              
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
                name="barcode-scanner"
                options={{
                  headerShown: false,
                  presentation: "fullScreenModal",
                }}
              />
              
              <Stack.Screen
                name="subscription"
                options={{
                  headerShown: false,
                  presentation: "modal",
                }}
              />
            </Stack>
            <SystemBars style="dark" />
          </WidgetProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
