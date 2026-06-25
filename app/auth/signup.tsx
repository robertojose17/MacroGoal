
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/utils/analytics';
import { trackOnboardingEvent } from '@/utils/onboardingAnalytics';
import * as Linking from 'expo-linking';

const BG_IMAGE = require('../../assets/images/73291328-4520-475d-9d5f-c23a5206eb1d.jpeg');


export default function SignUpScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const confirmPasswordRef = useRef<View>(null);

  useEffect(() => {
    console.log('[SignUp] Screen viewed');
    trackOnboardingEvent('auth_signup_screen_viewed');
  }, []);

  const handleSignUp = async () => {
    console.log('[SignUp] Button pressed — starting signup process');
    trackOnboardingEvent('auth_signup_attempted');

    if (!name || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      console.log('[SignUp] Step 1: Creating auth user...');

      const redirectUrl = Linking.createURL('/auth/verify');
      console.log('[SignUp] Email verification redirect URL:', redirectUrl);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: redirectUrl,
        },
      });

      if (authError) {
        console.error('[SignUp] Auth error:', authError);
        Alert.alert('Sign Up Failed', authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        console.error('[SignUp] No user returned from signup');
        Alert.alert('Sign Up Failed', 'Failed to create account. Please try again.');
        setLoading(false);
        return;
      }

      console.log('[SignUp] ✅ Auth user created:', authData.user.id);
      await trackEvent('account_created');
      trackOnboardingEvent('auth_signup_completed', undefined, { userId: authData.user.id });

      const emailConfirmationRequired = !authData.session;

      if (emailConfirmationRequired) {
        console.log('[SignUp] ⚠️ Email confirmation required — no session returned');
        Alert.alert(
          '✅ Check Your Email',
          `We sent a confirmation email to ${email}.\n\nOpen the email on this device and tap the link to verify your account.\n\n⚠️ Check your junk/spam folder if you don't see it.`,
          [
            {
              text: 'Got It',
              onPress: () => {
                console.log('[SignUp] User acknowledged email verification message');
                router.replace('/auth/login');
              },
            },
          ]
        );
        setLoading(false);
        return;
      }

      console.log('[SignUp] ✅ Session established immediately (email confirmation disabled)');
      console.log('[SignUp] Step 2: Creating user profile via Edge Function...');

      let profileCreated = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!profileCreated && retryCount < maxRetries) {
        try {
          console.log(`[SignUp] Profile creation attempt ${retryCount + 1}/${maxRetries}`);

          const { data: edgeFunctionData, error: edgeFunctionError } =
            await supabase.functions.invoke('create-user-profile', {
              body: { name },
            });

          if (edgeFunctionError) {
            console.error(
              `[SignUp] Edge Function error (attempt ${retryCount + 1}):`,
              edgeFunctionError
            );
            console.log('[SignUp] Falling back to direct insert...');

            const { data: existingUser } = await supabase
              .from('users')
              .select('id')
              .eq('id', authData.user.id)
              .maybeSingle();

            if (existingUser) {
              console.log('[SignUp] ✅ Profile already exists');
              profileCreated = true;
              break;
            }

            const { error: profileError } = await supabase.from('users').insert({
              id: authData.user.id,
              email: authData.user.email,
              name,
              user_type: 'free',
              onboarding_completed: false,
            });

            if (profileError) {
              console.error(
                `[SignUp] Profile creation error (attempt ${retryCount + 1}):`,
                profileError
              );

              if (profileError.code === '23505') {
                console.log('[SignUp] ✅ Profile already exists (duplicate key)');
                profileCreated = true;
                break;
              }

              retryCount++;
              if (retryCount < maxRetries) {
                const waitTime = retryCount * 2000;
                console.log(`[SignUp] Waiting ${waitTime}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
              }
            } else {
              console.log('[SignUp] ✅ Profile created successfully via direct insert');
              profileCreated = true;
            }
          } else {
            console.log('[SignUp] ✅ Profile created successfully via Edge Function');
            profileCreated = true;
          }
        } catch (error) {
          console.error(
            `[SignUp] Exception during profile creation (attempt ${retryCount + 1}):`,
            error
          );
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      if (!profileCreated) {
        console.error('[SignUp] ❌ Failed to create profile after all retries');
        // Profile creation failed but auth succeeded — _layout.tsx will route
        // to onboarding since onboarding_completed will be false/missing.
        console.log('[SignUp] Auth state change will handle navigation via _layout.tsx');
        setLoading(false);
        return;
      }

      console.log('[SignUp] ✅ Signup complete — auth state change will handle navigation via _layout.tsx');
    } catch (error: any) {
      console.error('[SignUp] Unexpected error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPasswordFocus = () => {
    confirmPasswordRef.current?.measureLayout(
      scrollViewRef.current as any,
      (_x: number, y: number) => {
        scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
      },
      () => {}
    );
  };

  const handleGoToLogin = () => {
    console.log('[SignUp] Navigate to Log In tapped');
    trackOnboardingEvent('signup_login_link_tapped');
    router.replace('/auth/login');
  };

  return (
    <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
      {/* Gradient overlay: transparent at top, solid black at bottom */}
      <LinearGradient
        colors={['transparent', 'transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)', '#000000']}
        locations={[0, 0.35, 0.55, 0.75, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Glassmorphism card */}
            <View style={styles.cardWrapper}>
              <BlurView intensity={20} tint="dark" style={styles.blurCard}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Create Account</Text>

                  <TextInput
                    style={styles.input}
                    placeholder="Your first name"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    autoCapitalize="words"
                    autoCorrect={false}
                    value={name}
                    onChangeText={setName}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Email address"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder="Password (min. 6 characters)"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />

                  <View ref={confirmPasswordRef}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm password"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={handleConfirmPasswordFocus}
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
                    onPress={handleSignUp}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.ctaButtonText}>Get Started</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleGoToLogin} style={styles.secondaryWrapper}>
                    <Text style={styles.secondaryText}>
                      Already have an account?{' '}
                      <Text style={styles.secondaryLink}>Log In</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  cardWrapper: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  blurCard: {
    borderRadius: 24,
  },
  cardInner: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 24,
    borderRadius: 24,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  ctaButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  ctaButtonDisabled: {
    opacity: 0.7,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryWrapper: {
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
  },
  secondaryLink: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
