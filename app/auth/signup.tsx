
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import * as Linking from 'expo-linking';

export default function SignUpScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    console.log('[SignUp] Starting signup process...');
    
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
      
      // Create deep link URL for email verification redirect
      const redirectUrl = Linking.createURL('/auth/verify');
      console.log('[SignUp] Email verification redirect URL:', redirectUrl);
      
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: redirectUrl, // Use deep link for email verification
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

      // Check if email confirmation is required
      const emailConfirmationRequired = !authData.session;
      
      if (emailConfirmationRequired) {
        console.log('[SignUp] ⚠️ Email confirmation required - no session returned');
        console.log('[SignUp] User will need to confirm email before logging in');
        
        // Show success message
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

      // If we have a session, continue with profile creation
      console.log('[SignUp] ✅ Session established immediately (email confirmation disabled)');

      // Step 4: Create user profile using Edge Function (bypasses RLS)
      console.log('[SignUp] Step 2: Creating user profile via Edge Function...');
      
      let profileCreated = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!profileCreated && retryCount < maxRetries) {
        try {
          console.log(`[SignUp] Profile creation attempt ${retryCount + 1}/${maxRetries}`);
          
          // Try to create profile using Edge Function
          const { data: edgeFunctionData, error: edgeFunctionError } = await supabase.functions.invoke('create-user-profile', {
            body: { name },
          });

          if (edgeFunctionError) {
            console.error(`[SignUp] Edge Function error (attempt ${retryCount + 1}):`, edgeFunctionError);
            
            // If Edge Function doesn't exist or fails, fall back to direct insert
            console.log('[SignUp] Falling back to direct insert...');
            
            // Check if profile already exists
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

            // Try direct insert
            const { error: profileError } = await supabase
              .from('users')
              .insert({
                id: authData.user.id,
                email: authData.user.email,
                name: name,
                user_type: 'free',
                onboarding_completed: false,
              });

            if (profileError) {
              console.error(`[SignUp] Profile creation error (attempt ${retryCount + 1}):`, profileError);
              console.error(`[SignUp] Error code: ${profileError.code}`);
              console.error(`[SignUp] Error message: ${profileError.message}`);
              
              // If it's a duplicate key error, that's actually success
              if (profileError.code === '23505') {
                console.log('[SignUp] ✅ Profile already exists (duplicate key)');
                profileCreated = true;
                break;
              }
              
              // Retry with exponential backoff
              retryCount++;
              if (retryCount < maxRetries) {
                const waitTime = retryCount * 2000; // 2s, 4s, 6s
                console.log(`[SignUp] Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
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
          console.error(`[SignUp] Exception during profile creation (attempt ${retryCount + 1}):`, error);
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (!profileCreated) {
        console.error('[SignUp] ❌ Failed to create profile after all retries');
        
        // Don't sign out - let them try to continue
        console.log('[SignUp] Allowing user to continue despite profile creation failure...');
        
        Alert.alert(
          'Account Created',
          'Your account was created successfully! Let\'s complete your profile setup.',
          [
            {
              text: 'Continue',
              onPress: () => {
                console.log('[SignUp] Navigating to onboarding...');
                router.replace('/onboarding/complete');
              },
            },
          ]
        );
        setLoading(false);
        return;
      }

      // Step 5: Success!
      console.log('[SignUp] ✅ Signup complete!');
      
      Alert.alert(
        'Success!',
        'Account created successfully! Let\'s set up your profile.',
        [
          {
            text: 'Continue',
            onPress: () => {
              console.log('[SignUp] Navigating to onboarding...');
              router.replace('/onboarding/complete');
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[SignUp] Unexpected error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Create Account
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Sign up to start tracking your nutrition
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Name
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder="Your first name"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              autoCapitalize="words"
              autoCorrect={false}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Email
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder="your@email.com"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Password
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder="At least 6 characters"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Confirm Password
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder="Re-enter your password"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Sign Up</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Already have an account?{' '}
            </Text>
            <TouchableOpacity onPress={() => router.replace('/auth/login')}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Log In
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.xxl : spacing.md,
    paddingBottom: spacing.xxl,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
  },
  form: {
    gap: spacing.lg,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  label: {
    ...typography.bodyBold,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  footerText: {
    ...typography.body,
  },
  footerLink: {
    ...typography.bodyBold,
  },
});
