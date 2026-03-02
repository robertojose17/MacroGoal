
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/app/integrations/supabase/client';
import * as Linking from 'expo-linking';

export default function VerifyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    console.log('[Verify] Screen mounted, setting up deep link listener...');

    const handleDeepLink = async (event: { url: string }) => {
      console.log('[Verify] Deep link received:', event.url);
      
      try {
        const url = new URL(event.url);
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');
        const type = url.searchParams.get('type');
        const errorDescription = url.searchParams.get('error_description');

        console.log('[Verify] URL params:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          type,
          errorDescription,
        });

        // Check for errors in the URL
        if (errorDescription) {
          console.error('[Verify] Error in verification link:', errorDescription);
          setStatus('error');
          setMessage('Verification failed: ' + errorDescription);
          setTimeout(() => {
            router.replace('/auth/login');
          }, 3000);
          return;
        }

        // Check if we have the required tokens
        if (accessToken && refreshToken) {
          console.log('[Verify] Tokens found, setting session...');
          setMessage('Setting up your account...');

          // Set the session using the tokens from the email link
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('[Verify] Error setting session:', error);
            setStatus('error');
            setMessage('Failed to verify email. Please try logging in.');
            setTimeout(() => {
              router.replace('/auth/login');
            }, 3000);
            return;
          }

          console.log('[Verify] ✅ Session set successfully!');
          console.log('[Verify] User ID:', data.session?.user?.id);

          // Check if user profile exists
          const userId = data.session?.user?.id;
          if (userId) {
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('onboarding_completed')
              .eq('id', userId)
              .maybeSingle();

            if (userError) {
              console.error('[Verify] Error checking user profile:', userError);
            }

            console.log('[Verify] User data:', userData);

            // Redirect based on onboarding status
            if (userData?.onboarding_completed) {
              console.log('[Verify] User has completed onboarding, redirecting to home...');
              setStatus('success');
              setMessage('Email verified! Redirecting to home...');
              setTimeout(() => {
                router.replace('/(tabs)/(home)');
              }, 1500);
            } else {
              console.log('[Verify] User needs to complete onboarding...');
              setStatus('success');
              setMessage('Email verified! Let\'s complete your profile...');
              setTimeout(() => {
                router.replace('/onboarding/complete');
              }, 1500);
            }
          } else {
            console.error('[Verify] No user ID in session');
            setStatus('error');
            setMessage('Verification failed. Please try logging in.');
            setTimeout(() => {
              router.replace('/auth/login');
            }, 3000);
          }
        } else {
          console.warn('[Verify] No tokens found in URL');
          setStatus('error');
          setMessage('Invalid verification link. Please try signing up again.');
          setTimeout(() => {
            router.replace('/auth/signup');
          }, 3000);
        }
      } catch (error) {
        console.error('[Verify] Error processing deep link:', error);
        setStatus('error');
        setMessage('An error occurred during verification.');
        setTimeout(() => {
          router.replace('/auth/login');
        }, 3000);
      }
    };

    // Listen for incoming deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[Verify] App opened with initial URL:', url);
        handleDeepLink({ url });
      } else {
        console.log('[Verify] No initial URL, waiting for deep link...');
      }
    });

    return () => {
      console.log('[Verify] Cleaning up deep link listener');
      subscription.remove();
    };
  }, [router]);

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.content}>
        {status === 'verifying' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.message, { color: isDark ? colors.textDark : colors.text }]}>
              {message}
            </Text>
          </>
        )}
        
        {status === 'success' && (
          <>
            <View style={styles.successIcon}>
              <Text style={styles.successEmoji}>✅</Text>
            </View>
            <Text style={[styles.message, { color: isDark ? colors.textDark : colors.text }]}>
              {message}
            </Text>
          </>
        )}
        
        {status === 'error' && (
          <>
            <View style={styles.errorIcon}>
              <Text style={styles.errorEmoji}>❌</Text>
            </View>
            <Text style={[styles.message, { color: isDark ? colors.textDark : colors.text }]}>
              {message}
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  message: {
    ...typography.h3,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  successIcon: {
    marginBottom: spacing.md,
  },
  successEmoji: {
    fontSize: 64,
  },
  errorIcon: {
    marginBottom: spacing.md,
  },
  errorEmoji: {
    fontSize: 64,
  },
});
