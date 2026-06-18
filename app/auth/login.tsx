
import React, { useState, useEffect } from 'react';
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
import { trackOnboardingEvent } from '@/utils/onboardingAnalytics';

const BG_IMAGE = require('../../assets/images/73291328-4520-475d-9d5f-c23a5206eb1d.jpeg');


export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[Login] Screen viewed');
    trackOnboardingEvent('auth_login_screen_viewed');
  }, []);

  const handleLogin = async () => {
    console.log('[Login] Button pressed — starting login process');

    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
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
          errorMessage =
            'Invalid email or password. Please check your credentials and try again.\n\nIf you just signed up, make sure you confirmed your email first.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage =
            "Please check your email and click the confirmation link before logging in. Check your spam folder if you don't see it.";
        }

        Alert.alert('Login Failed', errorMessage);
        setLoading(false);
        return;
      }

      if (!data.user) {
        console.error('[Login] No user returned from login');
        Alert.alert('Login Failed', 'Failed to log in. Please try again.');
        setLoading(false);
        return;
      }

      console.log('[Login] ✅ User logged in:', data.user.id);
      console.log('[Login] Auth state change will handle navigation via _layout.tsx');
    } catch (error: any) {
      console.error('[Login] Unexpected error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    console.log('[Login] Forgot password tapped');
    if (!email) {
      Alert.alert('Reset Password', 'Enter your email address above, then tap Forgot Password.');
      return;
    }
    supabase.auth
      .resetPasswordForEmail(email.trim().toLowerCase())
      .then(({ error }) => {
        if (error) {
          Alert.alert('Error', error.message);
        } else {
          Alert.alert('Check Your Email', 'A password reset link has been sent to your email.');
        }
      });
  };

  const handleGoToSignUp = () => {
    console.log('[Login] Navigate to Sign Up tapped');
    router.replace('/auth/signup');
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
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Glassmorphism card */}
            <View style={styles.cardWrapper}>
              <BlurView intensity={20} tint="dark" style={styles.blurCard}>
                <View style={styles.cardInner}>
                  <Text style={styles.cardTitle}>Welcome Back</Text>

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
                    placeholder="Password"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={password}
                    onChangeText={setPassword}
                  />

                  <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotWrapper}>
                    <Text style={styles.forgotText}>Forgot Password?</Text>
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
                      <Text style={styles.ctaButtonText}>Log In</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleGoToSignUp} style={styles.secondaryWrapper}>
                    <Text style={styles.secondaryText}>
                      Don&apos;t have an account?{' '}
                      <Text style={styles.secondaryLink}>Sign Up</Text>
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
