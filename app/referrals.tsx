import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Clipboard,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { getReferralStats, applyReferralCode } from '@/utils/referralApi';
import { getReferralEarningsStats, savePaypalEmail, ReferralEarningsStats } from '@/utils/referralEarningsApi';
import { supabase } from '@/lib/supabase/client';

const TEAL = '#14B8A6';
const GOLD = '#FFB547';

function formatMoney(amount: number): string {
  const n = Number(amount) || 0;
  return '$' + n.toFixed(2);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function productLabel(productId: string): string {
  const lower = (productId || '').toLowerCase();
  if (lower.includes('annual') || lower.includes('yearly') || lower.includes('year')) return 'Annual';
  if (lower.includes('month')) return 'Monthly';
  if (!productId || productId === 'unknown') return 'Subscription';
  return productId;
}

export default function ReferralsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { showPrompt } = useLocalSearchParams<{ showPrompt?: string }>();

  // Terms acceptance gate
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null); // null = loading
  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);

  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [totalReferrals, setTotalReferrals] = useState(0);

  const [copied, setCopied] = useState(false);

  const [earningsStats, setEarningsStats] = useState<ReferralEarningsStats | null>(null);

  // PayPal state
  const [paypalInput, setPaypalInput] = useState('');
  const [editingPaypal, setEditingPaypal] = useState(false);
  const [savingPaypal, setSavingPaypal] = useState(false);

  // Enter referral code modal
  const [enterModalVisible, setEnterModalVisible] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Check if user has already accepted creator terms
  useEffect(() => {
    const checkTermsAcceptance = async () => {
      console.log('[Referrals] Checking creator terms acceptance');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[Referrals] No user found, skipping terms check');
          setTermsAccepted(true);
          return;
        }
        const { data, error } = await supabase
          .from('affiliate_applications')
          .select('terms_accepted')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          console.error('[Referrals] Error checking terms acceptance:', error);
          setTermsAccepted(false);
          return;
        }
        const accepted = data?.terms_accepted === true;
        console.log('[Referrals] Terms accepted:', accepted);
        setTermsAccepted(accepted);
      } catch (e) {
        console.error('[Referrals] Unexpected error checking terms:', e);
        setTermsAccepted(false);
      }
    };
    checkTermsAcceptance();
  }, []);

  const handleAcceptTerms = async () => {
    console.log('[Referrals] Accept Terms button pressed');
    setSavingTerms(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Referrals] No user found when accepting terms');
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
        console.error('[Referrals] Error saving terms acceptance:', error);
        Alert.alert('Error', 'Could not save your acceptance. Please try again.');
        return;
      }
      console.log('[Referrals] Terms accepted and saved successfully');
      setTermsAccepted(true);
    } catch (e) {
      console.error('[Referrals] Unexpected error saving terms:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSavingTerms(false);
    }
  };

  const loadStats = useCallback(async () => {
    console.log('[Referrals] Loading referral stats and earnings stats');
    setLoading(true);
    try {
      const [stats, earnings] = await Promise.all([
        getReferralStats(),
        getReferralEarningsStats(),
      ]);
      setCode(stats.code);
      setTotalReferrals(stats.totalReferrals);

      console.log('[Referrals] earnings stats:', JSON.stringify(earnings?.recent_earnings?.length), 'items');
      setEarningsStats(earnings);
      if (earnings?.paypal_email) {
        setPaypalInput(earnings.paypal_email);
      }
    } catch (e) {
      console.error('[Referrals] Failed to load stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadStats();
  }, [loadStats]));

  useEffect(() => {
    if (showPrompt === 'true') {
      console.log('[Referrals] showPrompt param detected, opening enter-code modal');
      setEnterModalVisible(true);
    }
  }, [showPrompt]);

  const handleSubmitReferralCode = async () => {
    const trimmed = referralInput.trim().toUpperCase();
    if (!trimmed) return;
    console.log('[Referrals] Submitting referral code:', trimmed);
    setSubmitting(true);
    try {
      const result = await applyReferralCode(trimmed);
      if (!result.success) {
        if (result.error === 'You have already used a referral code') {
          Alert.alert('Already Used', 'You have already entered a referral code.');
        } else if (result.error === 'Invalid referral code' || (result.error ?? '').includes('Invalid')) {
          Alert.alert('Invalid Code', 'That referral code was not found. Please check and try again.');
        } else if (result.error === "You can't use your own referral code") {
          Alert.alert('Invalid Code', 'You cannot use your own referral code.');
        } else {
          Alert.alert('Error', 'Could not apply the referral code. Please try again.');
        }
        return;
      }
      console.log('[Referrals] Referral code applied successfully');
      setEnterModalVisible(false);
      setReferralInput('');
      Alert.alert('Success! 🎉', 'Referral code applied successfully!');
      loadStats();
    } catch (e) {
      console.error('[Referrals] Unexpected error submitting code:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    console.log('[Referrals] Copy code pressed:', code);
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!code) return;
    console.log('[Referrals] Share & Earn button pressed, code:', code);
    try {
      await Share.share({
        message: `Join Macro Goal with my code ${code} and start tracking your macros. Download: https://apps.apple.com/us/app/macro-goal/id6755788871 — use my code ${code} when you sign up!`,
      });
      console.log('[Referrals] Share sheet opened successfully');
    } catch (e) {
      console.warn('[Referrals] Share failed:', e);
    }
  };

  const handleSavePaypal = async () => {
    const email = paypalInput.trim();
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid PayPal email address.');
      return;
    }
    console.log('[Referrals] Save PayPal email pressed:', email);
    setSavingPaypal(true);
    try {
      const result = await savePaypalEmail(email);
      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to save PayPal email. Please try again.');
        return;
      }
      console.log('[Referrals] PayPal email saved successfully');
      setEarningsStats(prev => prev ? { ...prev, paypal_email: email } : prev);
      setEditingPaypal(false);
      Alert.alert('Saved!', 'Your PayPal email has been saved.');
    } catch (e) {
      console.error('[Referrals] Error saving PayPal email:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSavingPaypal(false);
    }
  };

  const bg = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? '#1A1C2E' : '#F0F2F7';

  const earningsPending = earningsStats?.earnings_pending ?? 0;
  const earningsAvailable = earningsStats?.earnings_available ?? 0;
  const earningsTotal = earningsStats?.earnings_total ?? 0;
  const premiumConverts = earningsStats?.premium_converts ?? 0;
  const recentEarnings = earningsStats?.recent_earnings ?? [];
  const savedPaypalEmail = earningsStats?.paypal_email ?? null;
  const showPaypalInput = !savedPaypalEmail || editingPaypal;

  const earningsPendingFormatted = formatMoney(earningsPending);
  const earningsAvailableFormatted = formatMoney(earningsAvailable);
  const earningsTotalFormatted = formatMoney(earningsTotal);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      </SafeAreaView>
    );
  }

  // Terms acceptance loading state
  if (termsAccepted === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      </SafeAreaView>
    );
  }

  const termsModalBg = isDark ? '#0A0A0F' : '#0A0A0F';
  const termsCardBg = isDark ? '#111118' : '#111118';
  const termsBorder = '#1E1E2E';
  const termsTextColor = '#C0C0D0';
  const termsMutedColor = '#6B6B80';
  const continueDisabled = !termsChecked || savingTerms;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={['bottom']}>

      {/* Creator Program Terms Gate Modal */}
      <Modal
        visible={!termsAccepted}
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
                console.log('[Referrals] Terms checkbox toggled:', next);
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="cash-outline" size={22} color={TEAL} />
            <Text style={[styles.heroTitle, { color: textColor }]}>Refer & Earn</Text>
          </View>
          <Text style={[styles.heroSubtitle, { color: GOLD }]}>Earn 50% Net Revenue Share 💰</Text>
          <Text style={[styles.heroBody, { color: mutedColor }]}>
            Share Macro Goal with friends, followers, or your audience. When someone you refer becomes a Premium member, you earn 50% of net proceeds (after app store fees).
          </Text>
        </View>

        {/* Your Code Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.codeLabel, { color: mutedColor }]}>YOUR CODE</Text>
          {code ? (
            <>
              <View style={[styles.codeBox, { backgroundColor: inputBg, borderColor: cardBorder }]}>
                <Text style={[styles.codeText, { color: TEAL }]}>{code}</Text>
                <TouchableOpacity onPress={handleCopy} style={styles.copyButton}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? TEAL : mutedColor} />
                  <Text style={[styles.copyLabel, { color: copied ? TEAL : mutedColor }]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[styles.codeLabel, { color: mutedColor }]}>Generating your code...</Text>
          )}
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: TEAL }]}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            <Text style={styles.shareButtonText}>Share & Earn</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={[styles.statsRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: textColor }]}>{totalReferrals}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Referrals</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: textColor }]}>{premiumConverts}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Premium</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Members</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: cardBorder }]} />
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: TEAL }]}>{earningsTotalFormatted}</Text>
            <Text style={[styles.statLabel, { color: mutedColor }]}>Earnings</Text>
          </View>
        </View>

        {/* Your Earnings Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="wallet-outline" size={20} color={TEAL} />
            <Text style={[styles.cardTitle, { color: textColor }]}>Your Earnings</Text>
          </View>
          <View style={[styles.earningsRow, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
            <Text style={[styles.earningsRowLabel, { color: mutedColor }]}>Available</Text>
            <Text style={[styles.earningsRowValue, { color: TEAL }]}>{earningsAvailableFormatted}</Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={[styles.earningsRowLabel, { color: mutedColor }]}>Pending (35-day hold)</Text>
            <Text style={[styles.earningsRowValue, { color: GOLD }]}>{earningsPendingFormatted}</Text>
          </View>
          <Text style={[styles.earningsNote, { color: mutedColor }]}>
            Payouts processed on the 1st of each month. Minimum $20.00.
          </Text>
        </View>

        {/* PayPal Setup Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.paypalIcon}>💳</Text>
            <Text style={[styles.cardTitle, { color: textColor }]}>PayPal Payout Account</Text>
          </View>
          {showPaypalInput ? (
            <>
              <TextInput
                style={[styles.paypalInput, { backgroundColor: inputBg, borderColor: cardBorder, color: textColor }]}
                placeholder="your@paypal.com"
                placeholderTextColor={mutedColor}
                value={paypalInput}
                onChangeText={setPaypalInput}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.paypalButtonRow}>
                {editingPaypal && (
                  <TouchableOpacity
                    style={[styles.paypalCancelBtn, { borderColor: cardBorder }]}
                    onPress={() => {
                      console.log('[Referrals] PayPal edit cancelled');
                      setEditingPaypal(false);
                      setPaypalInput(savedPaypalEmail || '');
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.paypalCancelText, { color: mutedColor }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.paypalSaveBtn, { backgroundColor: TEAL, opacity: savingPaypal ? 0.7 : 1 }]}
                  onPress={handleSavePaypal}
                  disabled={savingPaypal}
                  activeOpacity={0.85}
                >
                  {savingPaypal
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.paypalSaveText}>Save PayPal Email</Text>
                  }
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.paypalSavedRow}>
              <Ionicons name="checkmark-circle" size={18} color={TEAL} />
              <Text style={[styles.paypalSavedEmail, { color: textColor }]}>{savedPaypalEmail}</Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Referrals] Edit PayPal email pressed');
                  setEditingPaypal(true);
                  setPaypalInput(savedPaypalEmail || '');
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.paypalEditLink, { color: TEAL }]}>Edit</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.paypalNote, { color: mutedColor }]}>Required to receive payouts</Text>
        </View>

        {/* Recent Commissions Card */}
        {recentEarnings.length > 0 && (
          <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="receipt-outline" size={20} color={mutedColor} />
              <Text style={[styles.cardTitle, { color: textColor }]}>Recent Commissions</Text>
              <View style={[styles.countBadge, { backgroundColor: TEAL + '22' }]}>
                <Text style={[styles.countBadgeText, { color: TEAL }]}>{recentEarnings.length}</Text>
              </View>
            </View>
            {recentEarnings.map((item, i) => {
              const statusBg =
                item.status === 'available' ? TEAL + '22' :
                item.status === 'paid' ? (isDark ? '#3A3A3A' : '#E5E7EB') :
                GOLD + '22';
              const statusColor =
                item.status === 'available' ? TEAL :
                item.status === 'paid' ? mutedColor :
                GOLD;
              const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
              const commissionFormatted = formatMoney(item.commission_amount);
              const planLabel = productLabel(item.product_id);
              return (
                <View
                  key={i}
                  style={[styles.commissionRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}
                >
                  <View style={[styles.commissionAvatar, { backgroundColor: TEAL + '22' }]}>
                    <Ionicons name="person-outline" size={15} color={TEAL} />
                  </View>
                  <View style={styles.commissionInfo}>
                    <Text style={[styles.commissionUsername, { color: textColor }]}>
                      {'@'}
                      {item.referred_username}
                    </Text>
                    <Text style={[styles.commissionPlan, { color: mutedColor }]}>{planLabel}</Text>
                  </View>
                  <View style={styles.commissionRight}>
                    <Text style={[styles.commissionAmount, { color: textColor }]}>{commissionFormatted}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* How It Works Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="trophy-outline" size={20} color={GOLD} />
            <Text style={[styles.cardTitle, { color: textColor }]}>How It Works</Text>
          </View>
          {[
            'Share your code',
            'They download Macro Goal',
            'They enter your code when signing up',
            'They upgrade to Premium',
            'You earn 50% of net proceeds 💰',
          ].map((step, i) => (
            <View key={i} style={styles.howItWorksRow}>
              <View style={[styles.stepBadge, { backgroundColor: TEAL + '22' }]}>
                <Text style={[styles.stepNumber, { color: TEAL }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: textColor }]}>{step}</Text>
            </View>
          ))}
        </View>



        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Enter Referral Code Modal */}
      <Modal
        visible={enterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEnterModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="gift-outline" size={24} color={TEAL} />
              <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.primaryText }]}>
                Enter a Referral Code
              </Text>
            </View>
            <Text style={[styles.modalSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Got a code from a friend? Enter it below to apply it to your account.
            </Text>
            <TextInput
              style={[styles.codeInput, { backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7', borderColor: isDark ? colors.cardBorderDark : colors.cardBorder, color: isDark ? colors.textDark : colors.primaryText }]}
              placeholder="e.g. ABC123"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              value={referralInput}
              onChangeText={setReferralInput}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={20}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}
                onPress={() => {
                  console.log('[Referrals] Enter-code modal dismissed');
                  setEnterModalVisible(false);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalCancelText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Skip
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: TEAL, opacity: submitting ? 0.7 : 1 }]}
                onPress={handleSubmitReferralCode}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.modalSubmitText}>Apply Code</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.bodyBold,
    flex: 1,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    flex: 1,
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  heroBody: {
    ...typography.caption,
    lineHeight: 20,
  },
  codeLabel: {
    ...typography.small,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  codeText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 3,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statDivider: {
    width: 1,
    marginVertical: spacing.sm,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  statLabel: {
    ...typography.small,
    lineHeight: 16,
  },
  earningsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  earningsRowLabel: {
    ...typography.caption,
  },
  earningsRowValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  earningsNote: {
    ...typography.small,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  paypalIcon: {
    fontSize: 18,
  },
  paypalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  paypalButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  paypalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  paypalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  paypalSaveBtn: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paypalSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  paypalSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  paypalSavedEmail: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  paypalEditLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  paypalNote: {
    ...typography.small,
    fontStyle: 'italic',
  },
  commissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commissionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  commissionInfo: {
    flex: 1,
  },
  commissionUsername: {
    fontSize: 13,
    fontWeight: '600',
  },
  commissionPlan: {
    fontSize: 12,
  },
  commissionRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  commissionAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  howItWorksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepText: {
    ...typography.caption,
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  statusIcon: {
    fontSize: 24,
  },
  statusTextBlock: {
    flex: 1,
  },
  statusTitle: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  statusBody: {
    ...typography.caption,
  },
  bottomSpacer: { height: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 2,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
