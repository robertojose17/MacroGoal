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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

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
        console.log('[AffiliateWelcome] Full stats response:', JSON.stringify(stats, null, 2));
        console.log('[AffiliateWelcome] stats.has_profile:', stats?.has_profile);
        console.log('[AffiliateWelcome] stats.profile:', JSON.stringify(stats?.profile));
        if (stats?.profile?.affiliate_code) setAffiliateCode(stats.profile.affiliate_code);

        const appleStatus = stats?.profile?.apple_code_status;
        console.log('[AffiliateWelcome] apple_code_status (from stats.profile):', appleStatus);

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
        Alert.alert(t('affiliateWelcome.errorTitle'), t('affiliateWelcome.couldNotIdentifyAccount'));
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
        Alert.alert(t('affiliateWelcome.errorTitle'), t('affiliateWelcome.couldNotSaveAcceptance'));
        return;
      }
      console.log('[AffiliateWelcome] Terms accepted and saved');
      setTermsAccepted(true);
    } catch (e) {
      Alert.alert(t('affiliateWelcome.errorTitle'), t('affiliateWelcome.somethingWentWrong'));
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
              <Text style={styles.headline}>{t('affiliateWelcome.pendingHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('affiliateWelcome.pendingSubheadline')}
              </Text>
              {desiredCode ? (
                <View style={styles.codePill}>
                  <Text style={styles.codePillLabel}>{t('affiliateWelcome.requestedCode')}</Text>
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
              <Text style={styles.headline}>{t('affiliateWelcome.activatingHeadline')}</Text>
              {displayCode ? (
                <Text style={styles.subheadline}>
                  {t('affiliateWelcome.activatingSubheadlineWithCode1')}
                  <Text style={{ color: BLUE, fontWeight: '700' }}>{codeText}</Text>
                  {t('affiliateWelcome.activatingSubheadlineWithCode2')}
                </Text>
              ) : (
                <Text style={styles.subheadline}>
                  {t('affiliateWelcome.activatingSubheadline')}
                </Text>
              )}
              <Text style={styles.supportHint}>
                {t('affiliateWelcome.supportHintPrefix')}
                {' '}
                <Text style={styles.supportLink} onPress={handleContactSupport}>
                  {t('affiliateWelcome.contactSupport')}
                </Text>
                {t('affiliateWelcome.supportHintSuffix')}
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
              <Text style={styles.headline}>{t('affiliateWelcome.failedHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('affiliateWelcome.failedSubheadline')}
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{t('affiliateWelcome.contactSupport')}</Text>
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
              <Text style={styles.headline}>{t('affiliateWelcome.partialFailedHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('affiliateWelcome.partialFailedSubheadline')}
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{t('affiliateWelcome.contactSupport')}</Text>
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
              <Text style={styles.headline}>{t('affiliateWelcome.rejectedHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('affiliateWelcome.rejectedSubheadline')}
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{t('affiliateWelcome.contactSupport')}</Text>
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
              <Text style={styles.headline}>{t('affiliateWelcome.suspendedHeadline')}</Text>
              <Text style={styles.subheadline}>
                {t('affiliateWelcome.suspendedSubheadline')}
              </Text>
            </View>
            <View style={styles.buttonsSection}>
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: BLUE }]} onPress={handleContactSupport} activeOpacity={0.85}>
                <Text style={styles.primaryButtonText}>{t('affiliateWelcome.contactSupport')}</Text>
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
            <Text style={termsGateStyles.headerTitle}>{t('affiliateWelcome.termsGateTitle')}</Text>
            <Text style={[termsGateStyles.headerSubtitle, { color: termsMutedColor }]}>
              {t('affiliateWelcome.termsGateSubtitle')}
            </Text>
          </View>
        </SafeAreaView>

        <ScrollView
          style={termsGateStyles.scrollArea}
          contentContainerStyle={termsGateStyles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          <Text style={[termsGateStyles.termsHeading, { color: termsTextColor }]}>
            {t('affiliateWelcome.termsHeading')}
          </Text>
          <Text style={[termsGateStyles.termsVersion, { color: termsMutedColor }]}>{t('affiliateWelcome.termsVersion')}</Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms1Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms1Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms2Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms2Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms3Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms3Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms4Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms4Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms5Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms5Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms6Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms6Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms7Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms7Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms8Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms8Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms9Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms9Body')}
          </Text>

          <Text style={[termsGateStyles.sectionTitle, { color: termsTextColor }]}>{t('affiliateWelcome.terms10Title')}</Text>
          <Text style={[termsGateStyles.sectionBody, { color: termsMutedColor }]}>
            {t('affiliateWelcome.terms10Body')}
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
