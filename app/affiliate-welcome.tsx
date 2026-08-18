import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';

const TEAL = '#14B8A6';
const GOLD = '#FFB547';

export default function AffiliateWelcomeScreen() {
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.4)).current;

  // Terms gate state
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null); // null = loading
  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);

  // Check terms acceptance on mount
  useEffect(() => {
    const checkTermsAcceptance = async () => {
      console.log('[AffiliateWelcome] Checking creator terms acceptance');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[AffiliateWelcome] No user found, skipping terms check');
          setTermsAccepted(true);
          return;
        }
        const { data, error } = await supabase
          .from('affiliate_applications')
          .select('terms_accepted')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          console.error('[AffiliateWelcome] Error checking terms acceptance:', error);
          setTermsAccepted(false);
          return;
        }
        const accepted = data?.terms_accepted === true;
        console.log('[AffiliateWelcome] Terms accepted:', accepted);
        setTermsAccepted(accepted);
      } catch (e) {
        console.error('[AffiliateWelcome] Unexpected error checking terms:', e);
        setTermsAccepted(false);
      }
    };
    checkTermsAcceptance();
  }, []);

  // Run entrance animation once terms are accepted
  useEffect(() => {
    if (termsAccepted === true) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [termsAccepted, fadeAnim, scaleAnim]);

  const handleAcceptTerms = async () => {
    console.log('[AffiliateWelcome] Accept Terms button pressed');
    setSavingTerms(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[AffiliateWelcome] No user found when accepting terms');
        Alert.alert('Error', 'Could not identify your account. Please try again.');
        return;
      }
      const { error } = await supabase
        .from('affiliate_applications')
        .upsert(
          {
            user_id: user.id,
            terms_accepted: true,
            terms_accepted_at: new Date().toISOString(),
            terms_version: 'v1.0',
            full_name: '',
            email: '',
          },
          { onConflict: 'user_id' }
        );
      if (error) {
        console.error('[AffiliateWelcome] Error saving terms acceptance:', error);
        Alert.alert('Error', 'Could not save your acceptance. Please try again.');
        return;
      }
      console.log('[AffiliateWelcome] Terms accepted and saved successfully');
      setTermsAccepted(true);
    } catch (e) {
      console.error('[AffiliateWelcome] Unexpected error saving terms:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSavingTerms(false);
    }
  };

  const handleApply = () => {
    console.log('[AffiliateWelcome] "Apply to Creator Program" button pressed');
    Linking.openURL('https://macro-goal.wwk.link/apply/default');
  };

  const handleDashboard = () => {
    console.log('[AffiliateWelcome] "Log in to Dashboard" button pressed');
    Linking.openURL('https://app.winwinkit.com/');
  };

  const handleBack = () => {
    console.log('[AffiliateWelcome] Back button pressed');
    router.back();
  };

  const iconStyle = {
    opacity: fadeAnim,
    transform: [{ scale: scaleAnim }],
  };

  const continueDisabled = !termsChecked || savingTerms;

  const termsModalBg = '#0A0A0F';
  const termsCardBg = '#111118';
  const termsBorder = '#1E1E2E';
  const termsTextColor = '#C0C0D0';
  const termsMutedColor = '#6B6B80';

  // Loading state
  if (termsAccepted === null) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#0F0F0F', '#1A1A2E']}
      style={styles.gradient}
    >
      {/* Creator Program Terms Gate Modal */}
      <Modal
        visible={termsAccepted === false}
        animationType="fade"
        transparent={false}
        statusBarTranslucent
        onRequestClose={() => {/* not dismissible */}}
      >
        <View style={[termsGateStyles.root, { backgroundColor: termsModalBg }]}>
          {/* Header */}
          <SafeAreaView style={termsGateStyles.headerSafe}>
            <View style={[termsGateStyles.header, { borderBottomColor: termsBorder }]}>
              <Text style={termsGateStyles.headerTitle}>Creator Program Terms</Text>
              <Text style={[termsGateStyles.headerSubtitle, { color: termsMutedColor }]}>
                Please read and accept before continuing
              </Text>
            </View>
          </SafeAreaView>

          {/* Scrollable Terms */}
          <ScrollView
            style={termsGateStyles.scrollArea}
            contentContainerStyle={termsGateStyles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            <Text style={[termsGateStyles.termsHeading, { color: termsTextColor }]}>
              MACRO GOAL CREATOR PROGRAM TERMS
            </Text>
            <Text style={[termsGateStyles.termsVersion, { color: termsMutedColor }]}>Version 1.0</Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              1. Program Eligibility & Approval
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Participation requires explicit written approval by Macro Goal. Approval may be revoked at any time, for any reason, at Macro Goal's sole discretion, including but not limited to violation of these terms, fraudulent activity, or discontinuation of the program.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              2. Commission Structure
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Approved creators earn a one-time commission of 50% of eligible net proceeds on the first qualifying Premium subscription payment made by a referred user. "Eligible net proceeds" means the subscription price minus applicable app store fees. No commission is earned on renewals, upgrades, refunds, or any payment other than the initial qualifying purchase.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              3. Commission Hold Period
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              All earned commissions are subject to a 35-day hold period before becoming available for payout. Commissions may be reversed at any time during the hold period if the underlying transaction is refunded, disputed, or reversed by the payment processor or app store.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              4. Payout Terms
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Payouts are processed manually at Macro Goal's discretion. A minimum balance of $25.00 is required to request a payout. Macro Goal does not guarantee any specific payout schedule. Payouts are made via PayPal to the email address on file. Creator is responsible for providing accurate payment information and for any applicable taxes.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              5. Program Modification & Termination
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Macro Goal reserves the right to modify, suspend, or permanently discontinue the Creator Program at any time, with or without notice, for any reason. Commission rates, eligibility requirements, payout thresholds, and program terms may change at any time. Changes apply to future earnings only; commissions already marked "available" at the time of program changes will be honored.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              6. Removal from Program
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Macro Goal may remove any creator from the program immediately and without prior notice. Upon removal, pending commissions not yet marked "available" may be forfeited. Available balances at the time of removal will be paid out subject to the minimum threshold and standard hold periods.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              7. Fraud & Abuse
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Self-referrals, fake accounts, incentivized signups that violate App Store guidelines, and any manipulation of the referral system are strictly prohibited and will result in immediate removal and forfeiture of all pending and available commissions.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              8. No Guarantee of Earnings
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Participation in the Creator Program does not guarantee any specific level of earnings. Commission is only earned when a referred user completes a qualifying purchase.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              9. Relationship
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              Creators are independent contractors, not employees, agents, or partners of Macro Goal. Nothing in these terms creates any employment, partnership, or agency relationship.
            </Text>

            <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>
              10. Governing Law
            </Text>
            <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
              These terms are governed by applicable law. Any disputes shall be resolved in the applicable jurisdiction.
            </Text>
          </ScrollView>

          {/* Sticky Bottom */}
          <View style={[termsGateStyles.bottomBar, { backgroundColor: termsCardBg, borderTopColor: termsBorder }]}>
            {/* Checkbox row */}
            <TouchableOpacity
              style={termsGateStyles.checkboxRow}
              onPress={() => {
                const next = !termsChecked;
                console.log('[AffiliateWelcome] Terms checkbox toggled:', next);
                setTermsChecked(next);
              }}
              activeOpacity={0.7}
            >
              <View style={[
                termsGateStyles.checkbox,
                { borderColor: termsChecked ? TEAL : termsMutedColor },
                termsChecked && { backgroundColor: TEAL },
              ]}>
                {termsChecked && (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                )}
              </View>
              <Text style={[termsGateStyles.checkboxLabel, { color: termsTextColor }]}>
                I have read and agree to the Macro Goal Creator Program Terms
              </Text>
            </TouchableOpacity>

            {/* Continue button */}
            <TouchableOpacity
              style={[
                termsGateStyles.continueButton,
                { backgroundColor: continueDisabled ? '#2A2A3A' : TEAL },
              ]}
              onPress={handleAcceptTerms}
              disabled={continueDisabled}
              activeOpacity={0.85}
            >
              {savingTerms ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={[
                  termsGateStyles.continueButtonText,
                  { color: continueDisabled ? termsMutedColor : '#FFFFFF' },
                ]}>
                  Continue
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <SafeAreaView style={styles.safeArea}>
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.container}>
          <View style={styles.topSection}>
            <Animated.View style={iconStyle}>
              <Ionicons name="checkmark-circle" size={80} color={GOLD} />
            </Animated.View>

            <Text style={styles.headline}>
              You're In! 🎉
            </Text>

            <Text style={styles.subheadline}>
              Start earning by referring friends to Macro Goal. Apply below or log in to track your earnings.
            </Text>
          </View>

          <View style={styles.buttonsSection}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleApply}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Apply to Creator Program</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={handleDashboard}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineButtonText}>Log in to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  headline: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsSection: {
    width: '100%',
    gap: 14,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  outlineButtonText: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '600',
  },
});

const termsGateStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerSafe: {
    backgroundColor: 'transparent',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  termsHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  termsVersion: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  continueButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
