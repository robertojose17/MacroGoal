import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase/client';
import { getAffiliateStats } from '@/utils/affiliateApi';

const TEAL = '#14B8A6';
const GOLD = '#FFB547';
const BLUE = '#3b82f6';

type AffiliateStatus =
  | 'loading'
  | 'none'
  | 'pending'
  | 'activating'
  | 'active'
  | 'failed'
  | 'partial_failed'
  | 'rejected'
  | 'suspended';

export default function AffiliateWelcomeScreen() {
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.4)).current;

  const [status, setStatus] = useState<AffiliateStatus>('loading');
  const [desiredCode, setDesiredCode] = useState<string | null>(null);
  const [affiliateCode, setAffiliateCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Terms gate state (shown when status === 'none')
  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null);

  const loadStatus = useCallback(async (isRefresh = false) => {
    console.log('[AffiliateWelcome] Loading affiliate status', isRefresh ? '(refresh)' : '');
    if (!isRefresh) setStatus('loading');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('none');
        setTermsAccepted(false);
        return;
      }

      // Check terms acceptance
      const { data: appData } = await supabase
        .from('affiliate_applications')
        .select('terms_accepted, desired_code, status')
        .eq('user_id', user.id)
        .maybeSingle();

      setTermsAccepted(appData?.terms_accepted === true);
      if (appData?.desired_code) setDesiredCode(appData.desired_code);

      // Determine status from application
      if (!appData) {
        setStatus('none');
        return;
      }

      const appStatus = appData.status;

      if (appStatus === 'pending') {
        setStatus('pending');
        return;
      }

      if (appStatus === 'rejected') {
        setStatus('rejected');
        return;
      }

      if (appStatus === 'suspended') {
        setStatus('suspended');
        return;
      }

      if (appStatus === 'approved') {
        // Check affiliate profile for apple code status
        console.log('[AffiliateWelcome] Fetching affiliate stats for approved user');
        const stats = await getAffiliateStats();
        console.log('[AffiliateWelcome] Stats response:', JSON.stringify(stats));
        if (stats?.affiliate_code) setAffiliateCode(stats.affiliate_code);

        const appleStatus = stats?.profile?.apple_code_status ?? stats?.apple_code_status;
        console.log('[AffiliateWelcome] apple_code_status:', appleStatus);

        if (appleStatus === 'active') {
          console.log('[AffiliateWelcome] Apple code active — redirecting to /referrals');
          router.replace('/referrals');
          return;
        } else if (appleStatus === 'failed') {
          setStatus('failed');
        } else if (appleStatus === 'partial_failed') {
          setStatus('partial_failed');
        } else if (appleStatus === 'pending' || appleStatus === 'activating') {
          // Both 'pending' and 'activating' show the same "being activated" UI
          setStatus('activating');
        } else {
          setStatus('activating');
        }
        return;
      }

      setStatus('none');
    } catch (e) {
      console.error('[AffiliateWelcome] Error loading status:', e);
      setStatus('none');
      setTermsAccepted(false);
    }
  }, [router]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleRefresh = useCallback(async () => {
    console.log('[AffiliateWelcome] Pull-to-refresh triggered');
    setRefreshing(true);
    await loadStatus(true);
    setRefreshing(false);
  }, [loadStatus]);

  useEffect(() => {
    if (status === 'none' && termsAccepted === true) {
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
  }, [status, termsAccepted, fadeAnim, scaleAnim]);

  const handleAcceptTerms = async () => {
    console.log('[AffiliateWelcome] Accept Terms button pressed');
    setSavingTerms(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
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
        Alert.alert('Error', 'Could not save your acceptance. Please try again.');
        return;
      }
      console.log('[AffiliateWelcome] Terms accepted and saved');
      setTermsAccepted(true);
    } catch (e) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSavingTerms(false);
    }
  };

  const handleBack = () => {
    console.log('[AffiliateWelcome] Back button pressed');
    router.back();
  };

  const handleApply = () => {
    console.log('[AffiliateWelcome] Apply to Become an Affiliate button pressed');
    router.push('/affiliate-apply');
  };

  const handleContactSupport = () => {
    console.log('[AffiliateWelcome] Contact Support button pressed');
    Linking.openURL('mailto:support@macrogoal.app?subject=Affiliate%20Program%20Support');
  };

  if (status === 'loading') {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  // ── Pending ──────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.container}>
            <View style={styles.topSection}>
              <Ionicons name="time-outline" size={72} color={GOLD} />
              <Text style={styles.headline}>Application Under Review</Text>
              <Text style={styles.subheadline}>
                {"We'll review your application within 2-3 business days."}
              </Text>
              {desiredCode ? (
                <View style={styles.codePill}>
                  <Text style={styles.codePillLabel}>Requested Code</Text>
                  <Text style={styles.codePillValue}>{desiredCode}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Activating (covers both 'pending' and 'activating' apple_code_status) ─
  if (status === 'activating') {
    const displayCode = affiliateCode || desiredCode;
    const codeText = displayCode ?? '';
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={BLUE}
                colors={[BLUE]}
              />
            }
          >
            <View style={styles.topSection}>
              <ActivityIndicator size="large" color={BLUE} style={{ marginBottom: 16 }} />
              <Text style={styles.headline}>Your Code is Being Activated</Text>
              {displayCode ? (
                <Text style={styles.subheadline}>
                  {'Your affiliate code '}
                  <Text style={{ color: BLUE, fontWeight: '700' }}>{codeText}</Text>
                  {' is being set up with Apple. This can take up to 24 hours.'}
                </Text>
              ) : (
                <Text style={styles.subheadline}>
                  Your affiliate code is being set up with Apple. This can take up to 24 hours.
                </Text>
              )}
              <Text style={styles.supportHint}>
                If your code has not activated after 24 hours, please{' '}
                <Text style={styles.supportLink} onPress={handleContactSupport}>
                  contact support
                </Text>
                .
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Failed ───────────────────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={BLUE}
                colors={[BLUE]}
              />
            }
          >
            <View style={styles.topSection}>
              <Ionicons name="alert-circle-outline" size={72} color={colors.error} />
              <Text style={styles.headline}>Code Activation Failed</Text>
              <Text style={styles.subheadline}>
                There was an issue activating your code with Apple. Please contact support.
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Partial Failed ───────────────────────────────────────────────────────
  if (status === 'partial_failed') {
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={BLUE}
                colors={[BLUE]}
              />
            }
          >
            <View style={styles.topSection}>
              <Ionicons name="warning-outline" size={72} color={GOLD} />
              <Text style={styles.headline}>Partial Activation Issue</Text>
              <Text style={styles.subheadline}>
                One of your codes failed to activate. Please contact support.
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Rejected ─────────────────────────────────────────────────────────────
  if (status === 'rejected') {
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.container}>
            <View style={styles.topSection}>
              <Ionicons name="close-circle-outline" size={72} color={colors.error} />
              <Text style={styles.headline}>Application Not Approved</Text>
              <Text style={styles.subheadline}>
                Unfortunately your application was not approved at this time.
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Suspended ────────────────────────────────────────────────────────────
  if (status === 'suspended') {
    return (
      <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.container}>
            <View style={styles.topSection}>
              <Ionicons name="ban-outline" size={72} color={colors.error} />
              <Text style={styles.headline}>Account Suspended</Text>
              <Text style={styles.subheadline}>
                Your affiliate account has been suspended. Please contact support.
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── None: Terms gate + Welcome ────────────────────────────────────────────
  const termsModalBg = '#0A0A0F';
  const termsCardBg = '#111118';
  const termsBorder = '#1E1E2E';
  const termsTextColor = '#C0C0D0';
  const termsMutedColor = '#6B6B80';
  const continueDisabled = !termsChecked || savingTerms;

  if (termsAccepted === false) {
    return (
      <View style={[termsGateStyles.root, { backgroundColor: termsModalBg }]}>
        <SafeAreaView style={termsGateStyles.headerSafe}>
          <View style={[termsGateStyles.header, { borderBottomColor: termsBorder }]}>
            <TouchableOpacity onPress={handleBack} style={{ marginBottom: 8 }} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={termsGateStyles.headerTitle}>Creator Program Terms</Text>
            <Text style={[termsGateStyles.headerSubtitle, { color: termsMutedColor }]}>
              Please read and accept before continuing
            </Text>
          </View>
        </SafeAreaView>

        <ScrollView
          style={termsGateStyles.scrollArea}
          contentContainerStyle={termsGateStyles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={[termsGateStyles.termsHeading, { color: termsTextColor }]}>
            MACRO GOAL CREATOR PROGRAM TERMS
          </Text>
          <Text style={[termsGateStyles.termsVersion, { color: termsMutedColor }]}>Version 1.0</Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>1. Program Eligibility & Approval</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Participation requires explicit written approval by Macro Goal. Approval may be revoked at any time, for any reason, at Macro Goal's sole discretion, including but not limited to violation of these terms, fraudulent activity, or discontinuation of the program.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>2. Commission Structure</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Approved creators earn a one-time commission of 50% of eligible net proceeds on the first qualifying Premium subscription payment made by a referred user. "Eligible net proceeds" means the subscription price minus applicable app store fees. No commission is earned on renewals, upgrades, refunds, or any payment other than the initial qualifying purchase.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>3. Commission Hold Period</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            All earned commissions are subject to a 35-day hold period before becoming available for payout. Commissions may be reversed at any time during the hold period if the underlying transaction is refunded, disputed, or reversed by the payment processor or app store.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>4. Payout Terms</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Payouts are processed manually at Macro Goal's discretion. A minimum balance of $25.00 is required to request a payout. Macro Goal does not guarantee any specific payout schedule. Payouts are made via PayPal to the email address on file. Creator is responsible for providing accurate payment information and for any applicable taxes.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>5. Program Modification & Termination</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Macro Goal reserves the right to modify, suspend, or permanently discontinue the Creator Program at any time, with or without notice, for any reason. Commission rates, eligibility requirements, payout thresholds, and program terms may change at any time. Changes apply to future earnings only; commissions already marked "available" at the time of program changes will be honored.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>6. Removal from Program</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Macro Goal may remove any creator from the program immediately and without prior notice. Upon removal, pending commissions not yet marked "available" may be forfeited. Available balances at the time of removal will be paid out subject to the minimum threshold and standard hold periods.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>7. Fraud & Abuse</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Self-referrals, fake accounts, incentivized signups that violate App Store guidelines, and any manipulation of the referral system are strictly prohibited and will result in immediate removal and forfeiture of all pending and available commissions.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>8. No Guarantee of Earnings</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Participation in the Creator Program does not guarantee any specific level of earnings. Commission is only earned when a referred user completes a qualifying purchase.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>9. Relationship</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            Creators are independent contractors, not employees, agents, or partners of Macro Goal. Nothing in these terms creates any employment, partnership, or agency relationship.
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>10. Governing Law</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            These terms are governed by applicable law. Any disputes shall be resolved in the applicable jurisdiction.
          </Text>
        </ScrollView>

        <View style={[termsGateStyles.bottomBar, { backgroundColor: termsCardBg, borderTopColor: termsBorder }]}>
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
              {termsChecked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>
            <Text style={[termsGateStyles.checkboxLabel, { color: termsTextColor }]}>
              I have read and agree to the Macro Goal Creator Program Terms
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[termsGateStyles.continueButton, { backgroundColor: continueDisabled ? '#2A2A3A' : TEAL }]}
            onPress={handleAcceptTerms}
            disabled={continueDisabled}
            activeOpacity={0.85}
          >
            {savingTerms ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[termsGateStyles.continueButtonText, { color: continueDisabled ? termsMutedColor : '#FFFFFF' }]}>
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── None + terms accepted: Welcome screen ────────────────────────────────
  const iconStyle = {
    opacity: fadeAnim,
    transform: [{ scale: scaleAnim }],
  };

  return (
    <LinearGradient colors={['#0F0F0F', '#1A1A2E']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.container}>
          <View style={styles.topSection}>
            <Animated.View style={iconStyle}>
              <Ionicons name="checkmark-circle" size={80} color={GOLD} />
            </Animated.View>

            <Text style={styles.headline}>
              {"You're In! 🎉"}
            </Text>

            <Text style={styles.subheadline}>
              Apply to become an affiliate and start earning 50% commission on every referral you convert to Premium.
            </Text>
          </View>

          <View style={styles.buttonsSection}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: GOLD }]}
              onPress={handleApply}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryButtonText, { color: '#000' }]}>Apply to Become an Affiliate</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const colors = {
  error: '#EF4444',
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
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
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  supportHint: {
    marginTop: 24,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  supportLink: {
    color: BLUE,
    fontWeight: '600',
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
  codePill: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  codePillLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
  },
  codePillValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  buttonsSection: {
    width: '100%',
    gap: 14,
    marginBottom: 32,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

const termsGateStyles = StyleSheet.create({
  root: { flex: 1 },
  headerSafe: { backgroundColor: 'transparent' },
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
  scrollArea: { flex: 1 },
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
