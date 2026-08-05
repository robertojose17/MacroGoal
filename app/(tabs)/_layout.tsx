
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Modal, TextInput, KeyboardAvoidingView, Animated,
  Dimensions, Alert, Platform, TouchableOpacity, Text, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Tabs } from 'expo-router';
import { useNavigationState } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { AdBannerFooter } from '@/components/AdBannerFooter';
import { supabase } from '@/lib/supabase/client';
import { applyReferralCode } from '@/utils/referralApi';

const REFERRAL_PROMPT_KEY = 'referral_prompt_shown_v1';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const tabBarInactiveTintColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const tabBarBackgroundColor = isDark ? colors.cardDark : colors.card;
  const tabBarBorderColor = isDark ? colors.borderDark : colors.border;

  // ── Referral modal state ──
  const hasCheckedRef = useRef(false);
  const [referralModalVisible, setReferralModalVisible] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralApplying, setReferralApplying] = useState(false);
  const referralSlideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  const activeTabName = useNavigationState(state => state?.routes[state?.index]?.name);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    if (!activeTabName) return;
    if (activeTabName === 'coach') return;

    hasCheckedRef.current = true;
    console.log('[Tab Layout] Active tab changed to:', activeTabName, '— running referral check');

    const checkReferralPrompt = async () => {
      try {
        const shownLocally = await AsyncStorage.getItem(REFERRAL_PROMPT_KEY);
        if (shownLocally) return;

        let user = null;
        // Try up to 3 times with 500ms delay — session may not be ready immediately after login
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            user = session.user;
            break;
          }
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!user) {
          console.warn('[Tab Layout] No user session after 3 attempts — skipping referral check');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('referral_prompt_shown')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.warn('[Tab Layout] Supabase profile query failed, showing modal anyway:', profileError);
        } else if (profile?.referral_prompt_shown) {
          await AsyncStorage.setItem(REFERRAL_PROMPT_KEY, 'true');
          return;
        }

        console.log('[Tab Layout] First launch — showing referral code prompt');
        setReferralModalVisible(true);
        Animated.spring(referralSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      } catch (e) {
        console.warn('[Tab Layout] Failed to check referral prompt:', e);
      }
    };

    checkReferralPrompt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabName]);

  const dismissReferralModal = async () => {
    console.log('[Tab Layout] Referral modal dismissed');
    Animated.timing(referralSlideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setReferralModalVisible(false));
    try {
      await AsyncStorage.setItem(REFERRAL_PROMPT_KEY, 'true');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .update({ referral_prompt_shown: true })
          .eq('id', user.id);
      }
    } catch (e) {
      console.warn('[Tab Layout] Failed to save referral prompt flag:', e);
    }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) return;
    console.log('[Tab Layout] Apply referral code pressed:', referralCode.trim());
    setReferralApplying(true);
    try {
      const result = await applyReferralCode(referralCode.trim());
      if (result.success) {
        console.log('[Tab Layout] Referral code applied successfully');
        setReferralApplying(false);
        Alert.alert('🎉 Code Applied!', 'You and your friend both earned 1,000 XP!');
        await dismissReferralModal();
      } else {
        console.warn('[Tab Layout] Referral code failed:', result.error);
        setReferralApplying(false);
        Alert.alert('Invalid Code', result.error || 'Could not apply this code.');
      }
    } catch (e) {
      console.error('[Tab Layout] Unexpected error applying referral code:', e);
      setReferralApplying(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: tabBarInactiveTintColor,
          tabBarStyle: {
            backgroundColor: tabBarBackgroundColor,
            borderTopColor: tabBarBorderColor,
            paddingBottom: 15,
            height: 65,
          },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol
                ios_icon_name={focused ? 'chart.bar.fill' : 'chart.bar'}
                android_material_icon_name="analytics"
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="(home)"
          options={{
            title: 'Food',
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol
                ios_icon_name={focused ? 'fork.knife.circle.fill' : 'fork.knife.circle'}
                android_material_icon_name="restaurant"
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="coach"
          options={{
            title: 'Coach',
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol
                ios_icon_name={focused ? 'brain.head.profile.fill' : 'brain.head.profile'}
                android_material_icon_name="psychology"
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="check-ins"
          options={{
            title: 'Check-Ins',
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol
                ios_icon_name={focused ? 'checkmark.circle.fill' : 'checkmark.circle'}
                android_material_icon_name="check-circle"
                size={28}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => {
              console.log('[Tab Layout] Rendering Profile tab icon, focused:', focused);
              return (
                <IconSymbol
                  ios_icon_name={focused ? 'person.fill' : 'person'}
                  android_material_icon_name="person"
                  size={28}
                  color={color}
                />
              );
            },
          }}
        />
        <Tabs.Screen
          name="premium"
          options={{ href: null }}
        />
      </Tabs>
      <AdBannerFooter />

      {/* First-launch referral code modal */}
      {referralModalVisible && (
        <Modal transparent animationType="none" visible={referralModalVisible} onRequestClose={dismissReferralModal}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity
              style={referralStyles.overlay}
              activeOpacity={1}
              onPress={dismissReferralModal}
            >
              <Animated.View
                style={[
                  referralStyles.sheet,
                  { backgroundColor: isDark ? '#252740' : '#FFFFFF', transform: [{ translateY: referralSlideAnim }] },
                ]}
              >
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                  <View style={referralStyles.handle} />
                  <Text style={[referralStyles.title, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
                    {'🎁 Have a Referral Code?'}
                  </Text>
                  <Text style={[referralStyles.subtitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                    Were you invited to Macro Goal? Enter their code and you both earn 1,000 XP!
                  </Text>
                  <TextInput
                    style={[
                      referralStyles.input,
                      {
                        backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7',
                        borderColor: isDark ? '#3A3C52' : '#E5E7EB',
                        color: isDark ? '#F1F5F9' : '#2B2D42',
                      },
                    ]}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholder="Enter code here..."
                    placeholderTextColor={isDark ? '#A0A2B8' : '#6B7280'}
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={handleApplyReferralCode}
                  />
                  <View style={referralStyles.buttonRow}>
                    <TouchableOpacity
                      style={[referralStyles.applyButton, { backgroundColor: '#14B8A6', opacity: referralApplying ? 0.7 : 1 }]}
                      onPress={handleApplyReferralCode}
                      disabled={referralApplying}
                      activeOpacity={0.85}
                    >
                      {referralApplying ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={referralStyles.applyButtonText}>Apply Code</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[referralStyles.skipButton, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}
                      onPress={dismissReferralModal}
                      activeOpacity={0.85}
                    >
                      <Text style={[referralStyles.skipButtonText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                        Skip
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
}

const referralStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    marginBottom: spacing.md,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  applyButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  skipButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
