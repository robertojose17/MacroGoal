
import React, { useState, useEffect, useRef } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';
import { trackOnboardingEvent } from '@/utils/onboardingAnalytics';
import { useTranslation } from 'react-i18next';

const BG_IMAGE = require('../../assets/images/3ce4e800-3062-4acc-9a7a-16575bc5185c.jpeg');


export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const screenTrackedRef = useRef(false);

  useEffect(() => {
    if (screenTrackedRef.current) return;
    screenTrackedRef.current = true;
    console.log('[Login] Screen viewed');
    trackOnboardingEvent('auth_login_screen_viewed');
  }, []);

  const handleLogin = async () => {
    console.log('[Login] Button pressed — starting login process');
    trackOnboardingEvent('auth_login_attempted');

    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    setLoading(true);

    try {
      console.log('[Login] Step 1: Signing in with password...');
      console.log('[Login] Email:', email);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        console.error('[Login] Login error:', error);
        console.error('[Login] Error code:', error.status);
        console.error('[Login] Error message:', error.message);

        let errorMessage = error.message;
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = t('auth.invalidCredentials');
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = t('auth.checkEmailConfirmation');
        }

        Alert.alert(t('auth.loginFailed'), errorMessage);
        setLoading(false);
        return;
      }

      if (!data.user) {
        console.error('[Login] No user returned from login');
        Alert.alert(t('auth.loginFailed'), t('errors.generic'));
        setLoading(false);
        return;
      }

      console.log('[Login] ✅ User logged in:', data.user.id);
      trackOnboardingEvent('auth_login_completed', undefined, { userId: data.user.id });
      console.log('[Login] Auth state change will handle navigation via _layout.tsx');
    } catch (error: any) {
      console.error('[Login] Unexpected error:', error);
      Alert.alert(t('common.error'), error.message || t('common.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    console.log('[Login] Forgot password tapped');
    if (!email) {
      Alert.alert(t('auth.forgotPassword'), 'Enter your email address above, then tap Forgot Password.');
      return;
    }
    supabase.auth
      .resetPasswordForEmail(email.trim().toLowerCase())
      .then(({ error }) => {
        if (error) {
          Alert.alert(t('common.error'), error.message);
        } else {
          Alert.alert(t('auth.checkYourEmail'), 'A password reset link has been sent to your email.');
        }
      });
  };

  const handleGoToSignUp = () => {
    console.log('[Login] Navigate to Sign Up tapped');
    trackOnboardingEvent('login_signup_link_tapped');
    router.replace('/auth/signup');
  };

  return (
    <View style={styles.bg}>
      <Image
        source={BG_IMAGE}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
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
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Glassmorphism card */}
            <View style={styles.cardWrapper}>
              <BlurView intensity={20} tint="dark" style={styles.blurCard}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>{t('auth.loginToAccount')}</Text>

                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.email')}
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />

                  <TextInput
                    style={styles.input}
                    placeholder={t('auth.password')}
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />

                  <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotWrapper}>
                    <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.ctaButton, loading && styles.ctaButtonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.ctaButtonText}>{t('auth.signIn')}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleGoToSignUp} style={styles.secondaryWrapper}>
                    <Text style={styles.secondaryText}>
                      {t('auth.dontHaveAccount')}{' '}
                      <Text style={styles.secondaryLink}>{t('auth.signUp')}</Text>
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
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
  forgotWrapper: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
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
