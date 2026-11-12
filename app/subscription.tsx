
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  ImageBackground,
  ScrollView,
  Image,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { getPaywallTop } from '@/utils/paywallTopContent';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/utils/analytics';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, isPurchasesAvailable, withRevenueCatUser, revenueCatLeaseCurrent, getRevenueCatOffering } from '@/utils/purchases';
import type { RevenueCatLease } from '@/utils/purchases';
import { usePremium } from '@/hooks/usePremium';
import { premiumEntitlement } from '@/utils/premiumEntitlement';
import { validateAndAttributeCode } from '@/utils/affiliateApi';
import { syncPremiumMembership } from '@/utils/premiumSync';
import { capturePremiumFlow, newCheckpointId } from '@/utils/premiumCheckpointContract';
import type { Attribution } from '@/utils/premiumCheckpointContract';
import { checkpoint, checkpointActor, displayedPackage, purchaseAttribution, observedPurchaseError, actorStillCurrent, transactionCandidate } from '@/utils/premiumCheckpoints';
import { usePremiumCheckpointVisibility } from '@/hooks/usePremiumCheckpointVisibility';

function loadPurchases(): { Purchases: any; LOG_LEVEL: any } {
  if (!isPurchasesAvailable) return { Purchases: null, LOG_LEVEL: null };
  return { Purchases, LOG_LEVEL };
}
// Type aliases so we don't import from the native module
type PurchasesPackage = any;
type PurchasesOffering = any;

// Premium features list (used in web + isPremium views)
const PREMIUM_FEATURES = [
  'localization.shared.premium0',
  'localization.shared.premium1',
  'localization.shared.premium2',
  'localization.shared.premium3',
  'localization.shared.premium4',
];

const DARK_BG = '#0d0d0d';
const DARK_CARD = '#1a1a1a';
const DARK_CARD_SELECTED = 'rgba(255,255,255,0.08)';

type FeatureKey = 'snap' | 'mealplans' | 'progress' | 'noads' | 'grocery';

interface FeatureItem {
  key: FeatureKey;
  icon_ios: string;
  icon_android: keyof typeof import('@expo/vector-icons/MaterialIcons').glyphMap;
  label: string;
  description: string;
}

const ICON_GRID_ITEM_KEYS: { key: string; icon_ios: string; icon_android: string; labelKey: string; description: string }[] = [
  {
    key: 'snap',
    icon_ios: 'camera.fill',
    icon_android: 'camera-alt',
    labelKey: 'subscription.feature_snapTrack',
    description: 'Snap a photo to estimate calories & macros instantly.',
  },
  {
    key: 'mealplans',
    icon_ios: 'calendar',
    icon_android: 'calendar-today',
    labelKey: 'subscription.feature_mealPlans',
    description: 'Get personalized meal plans tailored to your goals.',
  },
  {
    key: 'progress',
    icon_ios: 'chart.line.uptrend.xyaxis',
    icon_android: 'trending-up',
    labelKey: 'subscription.feature_progress',
    description: 'Track your progress with detailed charts and insights.',
  },
  {
    key: 'noads',
    icon_ios: 'sparkles',
    icon_android: 'auto-awesome',
    labelKey: 'subscription.feature_noAds',
    description: 'Enjoy a clean, ad-free experience.',
  },
  {
    key: 'grocery',
    icon_ios: 'cart.fill',
    icon_android: 'shopping-cart',
    labelKey: 'subscription.feature_groceryList',
    description: 'Auto-generate grocery lists from your meal plans.',
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { width: screenWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const { isPremium, customerInfo, loading: premiumLoading, refreshPremiumStatus } = usePremium();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<'monthly' | 'yearly'>('yearly');
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey | null>(null);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const { autoStart, source, flowId } = useLocalSearchParams<{ autoStart?: string; source?: string; flowId?: string }>();
  const [checkpointFlow] = useState(() => capturePremiumFlow(source, flowId));
  const purchaseBusyRef = React.useRef(false);
  const restoreBusyRef = React.useRef(false);
  const configuredActorRef = React.useRef<string | null>(null);
  const offerViewport = React.useRef<ScrollView | null>(null);
  const observeOffer = usePremiumCheckpointVisibility(checkpointFlow,
    Platform.OS !== 'web' && !loading && !premiumLoading && !errorMessage && !isPremium && !purchasing && !showSuccessModal, offerViewport);
  const cardRef = (pkg: PurchasesPackage) => {
    const offer = displayedPackage(pkg, offerings?.identifier);
    return offer ? observeOffer(JSON.stringify(offer), { name: 'offer_displayed', offer }) : undefined;
  };
  const autoStartFiredRef = React.useRef(false);

  // Affiliate code state
  const [affiliateCodeInput, setAffiliateCodeInput] = useState('');
  const [affiliateCodeStatus, setAffiliateCodeStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [affiliateCodeApplied, setAffiliateCodeApplied] = useState('');
  const [redemptionUrl, setRedemptionUrl] = useState<string | null>(null);

  // Prefer the actual StoreKit/RevenueCat billing period. A package name
  // alone must not label a weekly or multi-month product as monthly/annual.
  const resolvedMonthlyPkg = packages.find((pkg: PurchasesPackage) =>
    pkg.product?.subscriptionPeriod === 'P1M' ||
    (!pkg.product?.subscriptionPeriod && pkg.packageType === 'MONTHLY')
  );
  const resolvedYearlyPkg = packages.find((pkg: PurchasesPackage) =>
    ['P1Y', 'P12M'].includes(pkg.product?.subscriptionPeriod) ||
    (!pkg.product?.subscriptionPeriod && pkg.packageType === 'ANNUAL')
  );

  // All native SDK identity mutations go through the shared coordinator.
  const initializationRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  const initializeRevenueCat = async () => {
    const ticket = ++initializationRef.current;
    const current = () => mountedRef.current && initializationRef.current === ticket;
    if (Platform.OS === 'web' || !isPurchasesAvailable) { setLoading(false); return; }
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!current()) return;
      const user = data.session?.user;
      if (error || !user) throw new Error('RC_AUTH_REQUIRED');
      // Subscriber email is handled by the root login path. No optional profile
      // query or display-name write belongs on the purchase availability path.
      const identifier = Constants.expoConfig?.extra?.revenueCat?.offeringIdentifier || 'Monthly_MG';
      const result = await getRevenueCatOffering(user.id, identifier);
      if (!current() || !revenueCatLeaseCurrent(result.lease)) return;
      configuredActorRef.current = user.id;
      setOfferings(result.offering);
      setPackages(result.offering.availablePackages);
    } catch {
      if (current()) {
        configuredActorRef.current = null;
        setOfferings(null); setPackages([]);
        setErrorMessage(/^es/i.test(i18n.language)
          ? 'No pudimos cargar tus planes. Revisa tu conexión e inténtalo de nuevo.'
          : 'We could not load your plans. Check your connection and try again.');
      }
    } finally { if (current()) setLoading(false); }
  };

  useEffect(() => {
    mountedRef.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let owner: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === owner) return;
      owner = next;
      initializationRef.current += 1;
      configuredActorRef.current = null;
      setOfferings(null); setPackages([]); setShowSuccessModal(false);
      setPurchasing(false); setSelectedPackage(null);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void initializeRevenueCat(); }, 0);
    });
    void initializeRevenueCat();
    return () => {
      mountedRef.current = false;
      initializationRef.current += 1;
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  // Onboarding requests annual only. Use the same resolved package as the
  // annual card, and leave any other available plan for an explicit selection.
  useEffect(() => {
    if (
      source === 'onboarding_complete' || autoStart !== 'true' || loading || premiumLoading || errorMessage || isPremium ||
      !resolvedYearlyPkg || autoStartFiredRef.current
    ) return;
    autoStartFiredRef.current = true;
    setActivePlan('yearly');
    console.log('[Subscription] Auto-starting yearly purchase from onboarding:', resolvedYearlyPkg.identifier);
    handlePurchase(resolvedYearlyPkg, 'auto_start');
  }, [autoStart, source, loading, premiumLoading, errorMessage, isPremium, resolvedYearlyPkg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle purchase
  const handlePurchase = async (pkg: PurchasesPackage, trigger: 'manual' | 'auto_start' = 'manual') => {
    if (Platform.OS === 'web') {
      Alert.alert(
        t('subscription.notAvailableWeb'),
        t('subscription.notAvailableWebMsg')
      );
      return;
    }

    if (purchasing || purchaseBusyRef.current || restoreBusyRef.current) {
      console.log('[Subscription] Purchase already in progress');
      return;
    }

    const { Purchases } = loadPurchases();
    purchaseBusyRef.current = true;
    const actor = checkpointActor();
    const attemptId = newCheckpointId();
    let attribution: Attribution = 'unknown';
    let sdkInvoked = false;
    let resultRecorded = false;
    let operationLease: RevenueCatLease | null = null;

    try {
      console.log('[Subscription] ========== STARTING PURCHASE ==========');
      console.log('[Subscription] Package:', {
        identifier: pkg.identifier,
        productId: pkg.product.identifier,
        price: pkg.product.priceString,
      });

      setPurchasing(true);
      setSelectedPackage(pkg.identifier);

      const purchaseResult = await withRevenueCatUser<any>(configuredActorRef.current || '', async (sdk, lease) => {
        operationLease = lease;
        if (!mountedRef.current) throw new Error('RC_SCREEN_CLOSED');
        attribution = await purchaseAttribution(sdk, actor);
        if (!revenueCatLeaseCurrent(lease)) throw new Error('RC_ACCOUNT_CHANGED');
        if (lease.userId !== actor?.userId) attribution = 'unknown';
        const offer = displayedPackage(pkg, offerings?.identifier);
        if (offer) checkpoint(checkpointFlow, { name: 'purchase_attempt', attemptId, offer, trigger, attribution }, actor);
        sdkInvoked = true;
        return sdk.purchasePackage(pkg);
      });
      if (!mountedRef.current || !operationLease || !revenueCatLeaseCurrent(operationLease)) return;
      const { customerInfo, productIdentifier } = purchaseResult;

      console.log('[Subscription] ✅ Purchase successful');
      console.log('[Subscription] Product:', productIdentifier);
      console.log('[Subscription] Active entitlements:', Object.keys(customerInfo.entitlements.active));

      // Check if premium entitlement is now active
      const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
      const entitlementIdentifier = revenueCatConfig?.entitlementIdentifier || 'Macrogoal Pro';
      const hasActiveEntitlement = !!premiumEntitlement(customerInfo, entitlementIdentifier);

      // An SDK entitlement is a client observation, never a verified new sale.
      const resultAttribution = actorStillCurrent(actor) ? await purchaseAttribution(Purchases, actor) : 'unknown';
      checkpoint(checkpointFlow, { name: 'purchase_result', attemptId,
        attribution: (attribution as Attribution) === 'consistent' ? resultAttribution : attribution,
        outcome: hasActiveEntitlement ? 'sdk_returned_entitlement' : 'sdk_returned_no_entitlement',
        ...(transactionCandidate(purchaseResult) ? { correlation: transactionCandidate(purchaseResult) } : {}) }, actor);
      resultRecorded = true;
      if (!mountedRef.current || !operationLease || !revenueCatLeaseCurrent(operationLease)) return;
      void refreshPremiumStatus();

      if (hasActiveEntitlement) {
        console.log('[Subscription] ✅ Premium access granted');
        console.log('[Subscription] Triggering premium membership sync after purchase');
        syncPremiumMembership().catch(console.warn);
        setShowSuccessModal(true);
      } else {
        console.warn('[Subscription] ⚠️ Purchase completed but premium not active');
        Alert.alert(
          t('subscription.purchaseCompleted'),
          t('subscription.purchaseCompletedMsg')
        );
      }

    } catch (error: any) {
      if (sdkInvoked && !resultRecorded) checkpoint(checkpointFlow, { name: 'purchase_result', attemptId,
        attribution: actorStillCurrent(actor) ? attribution : 'unknown', outcome: observedPurchaseError(error) }, actor);
      console.error('[Subscription] ❌ Purchase error:', error);
      console.error('[Subscription] Error details:', {
        message: error.message,
        code: error.code,
        userCancelled: error.userCancelled,
      });

      // Handle specific error codes
      if (!mountedRef.current || (operationLease && !revenueCatLeaseCurrent(operationLease))) return;
      const outcome = observedPurchaseError(error);
      if (outcome === 'canceled') {
        console.log('[Subscription] User cancelled purchase');
        // Don't show alert for user cancellation
      } else if (outcome === 'pending') {
        Alert.alert(/^es/i.test(i18n.language) ? 'Pago pendiente' : 'Payment pending',
          /^es/i.test(i18n.language) ? 'La tienda está procesando tu pago. No vuelvas a comprar mientras se confirma.' : 'The store is processing your payment. Do not purchase again while it is being confirmed.');
      } else if (outcome === 'already_owned') {
        Alert.alert(
          t('subscription.alreadySubscribed'),
          t('subscription.alreadySubscribedMsg')
        );
      } else if (['10', 'NETWORK_ERROR'].includes(String(error.code))) {
        Alert.alert(
          t('subscription.networkError'),
          t('subscription.networkErrorMsg')
        );
      } else {
        Alert.alert(
          t('subscription.purchaseFailed'),
          t('subscription.purchaseFailedMsg')
        );
      }
    } finally {
      purchaseBusyRef.current = false;
      if (mountedRef.current && (!operationLease || revenueCatLeaseCurrent(operationLease))) {
        setPurchasing(false);
        setSelectedPackage(null);
      }
      console.log('[Subscription] ========== PURCHASE COMPLETE ==========');
    }
  };

  // Restore purchases
  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        t('subscription.notAvailableWeb'),
        t('subscription.restoreNotAvailableWebMsg')
      );
      return;
    }

    if (restoreBusyRef.current || purchaseBusyRef.current) return;
    restoreBusyRef.current = true;
    const { Purchases } = loadPurchases();
    const actor = checkpointActor();
    const attemptId = newCheckpointId();
    let attribution: Attribution = 'unknown';
    let sdkInvoked = false;
    let resultRecorded = false;
    let operationLease: RevenueCatLease | null = null;
    try {
      console.log('[Subscription] ========== RESTORING PURCHASES ==========');
      setLoading(true);

      const { data: restoreSession } = await supabase.auth.getSession();
      const info = await withRevenueCatUser<any>(restoreSession.session?.user.id || '', async (sdk, lease) => {
        operationLease = lease;
        if (!mountedRef.current) throw new Error('RC_SCREEN_CLOSED');
        attribution = await purchaseAttribution(sdk, actor);
        if (!revenueCatLeaseCurrent(lease)) throw new Error('RC_ACCOUNT_CHANGED');
        checkpoint(checkpointFlow, { name: 'restore_attempt', attemptId }, actor);
        sdkInvoked = true;
        return sdk.restorePurchases();
      });
      if (!mountedRef.current || !operationLease || !revenueCatLeaseCurrent(operationLease)) return;
      console.log('[Subscription] ✅ Purchases restored');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));


      const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
      const entitlementIdentifier = revenueCatConfig?.entitlementIdentifier || 'Macrogoal Pro';
      const hasActiveEntitlement = !!premiumEntitlement(info, entitlementIdentifier);

      const resultAttribution = actorStillCurrent(actor) ? await purchaseAttribution(Purchases, actor) : 'unknown';
      checkpoint(checkpointFlow, { name: 'restore_result', attemptId,
        attribution: (attribution as Attribution) === 'consistent' ? resultAttribution : attribution,
        outcome: hasActiveEntitlement ? 'restored_entitlement' : 'no_entitlement' }, actor);
      resultRecorded = true;
      if (!mountedRef.current || !operationLease || !revenueCatLeaseCurrent(operationLease)) return;
      void refreshPremiumStatus();

      if (hasActiveEntitlement) {
        console.log('[Subscription] Triggering premium membership sync after restore');
        syncPremiumMembership().catch(console.warn);
        Alert.alert(
          t('common.success'),
          t('subscription.restoreSuccess')
        );
      } else {
        Alert.alert(
          t('subscription.noActiveSubscriptions'),
          t('subscription.noActiveSubscriptionsMsg')
        );
      }

    } catch (error: any) {
      const observed = observedPurchaseError(error);
      if (sdkInvoked && !resultRecorded) checkpoint(checkpointFlow, { name: 'restore_result', attemptId,
        attribution: actorStillCurrent(actor) ? attribution : 'unknown', outcome: observed === 'already_owned' ? 'error' : observed }, actor);
      if (!mountedRef.current || (operationLease && !revenueCatLeaseCurrent(operationLease))) return;
      if (observed === 'canceled') return;
      if (observed === 'pending') {
        Alert.alert(/^es/i.test(i18n.language) ? 'Pago pendiente' : 'Payment pending',
          /^es/i.test(i18n.language) ? 'Espera a que la tienda confirme el pago y vuelve a comprobar tu acceso.' : 'Wait for the store to confirm payment, then check your access again.');
        return;
      }
      if (observed === 'already_owned') {
        Alert.alert(t('subscription.alreadySubscribed'), t('subscription.alreadySubscribedMsg'));
        return;
      }
      console.warn('[Subscription] Restore failed');
      Alert.alert(
        t('subscription.restoreFailed'),
        t('subscription.restoreFailedMsg')
      );
    } finally {
      restoreBusyRef.current = false;
      if (mountedRef.current && (!operationLease || revenueCatLeaseCurrent(operationLease))) setLoading(false);
      console.log('[Subscription] ========== RESTORE COMPLETE ==========');
    }
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('subscription.title')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.webMessageContainer}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={64}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.webMessageTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('subscription.webTitle')}
          </Text>
          <Text style={[styles.webMessageText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('subscription.webMobileOnly')}
          </Text>
          <Text style={[styles.webMessageText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('subscription.webDownloadPrompt')}
          </Text>

          <View style={styles.featuresList}>
            {PREMIUM_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.primary}
                />
                <Text style={[styles.featureText, { color: isDark ? colors.textDark : colors.text }]}>
                  {t(feature)}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>{t('subscription.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading || premiumLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: DARK_BG }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: '#fff' }]}>
            {t('subscription.loadingText')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Unsupported offerings must expose the existing retry UI, not an empty paywall.
  if (!isPremium && (errorMessage || (!resolvedMonthlyPkg && !resolvedYearlyPkg))) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: DARK_BG }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: '#fff' }]}>
            {t('subscription.title')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.errorContainer}>
          <View style={[styles.iconCircle, { backgroundColor: colors.error + '20' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="error"
              size={64}
              color={colors.error}
            />
          </View>
          <Text style={[styles.errorTitle, { color: '#fff' }]}>
            {t('subscription.errorTitle')}
          </Text>
          <Text style={[styles.errorMessage, { color: 'rgba(255,255,255,0.6)' }]}>
            {t('localization.shared.subscriptionUnavailable')}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => {
              setErrorMessage(null);
              setLoading(true);
              initializeRevenueCat();
            }}
          >
            <Text style={styles.buttonText}>{t('subscription.tryAgain')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: DARK_CARD, marginTop: spacing.md }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.buttonText, { color: '#fff' }]}>
              {t('subscription.goBack')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const PREMIUM_HERO_FEATURES = [
    { ios: 'camera.fill', android: 'camera-alt', label: t('localization.shared.hero0'), desc: t('localization.shared.hero1') },
    { ios: 'list.clipboard.fill', android: 'assignment', label: t('localization.shared.hero2'), desc: t('localization.shared.hero3') },
    { ios: 'cart.fill', android: 'shopping-cart', label: t('localization.shared.hero4'), desc: t('localization.shared.hero5') },
    { ios: 'chart.line.uptrend.xyaxis', android: 'trending-up', label: t('localization.shared.hero6'), desc: t('localization.shared.hero7') },
    { ios: 'checkmark.shield.fill', android: 'verified-user', label: t('localization.shared.hero8'), desc: t('localization.shared.hero9') },
  ];

  if (isPremium) {
    return (
      <View style={styles.premiumRoot}>
        <StatusBar style="light" />
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── HERO ── */}
          <ImageBackground
            source={require('@/assets/images/8ca2a60e-2ac8-4108-bfd6-c69883d16672.jpeg')}
            style={styles.premiumHero}
            resizeMode="cover"
            imageStyle={{ resizeMode: 'cover' }}
          >
            {/* Left-to-right dark overlay so text is readable */}
            <LinearGradient
              colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />

            {/* Bottom-left hero content */}
            <View style={styles.heroBottomContent}>
              {/* Crown pill */}
              <View style={styles.premiumPill}>
                <IconSymbol
                  ios_icon_name="crown.fill"
                  android_material_icon_name="emoji-events"
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.premiumPillText}>{t('subscription.premiumPill')}</Text>
              </View>

              {/* Headline */}
              <View>
                <Text style={styles.heroHeadline}>{t('subscription.youre')}</Text>
                <Text style={styles.heroHeadlineAccent}>{t('subscription.premiumHeadline')}</Text>
              </View>

              {/* Subtitle */}
              <Text style={styles.heroSubtitle}>
                {t('subscription.enjoyAccess')}
              </Text>
            </View>
          </ImageBackground>

          {/* ── FEATURES CARD ── */}
          <View style={styles.premiumFeaturesCard}>
            {PREMIUM_HERO_FEATURES.map((item, index) => (
              <View key={item.label}>
                <View style={styles.premiumFeatureRow}>
                  <View style={styles.premiumFeatureIconBox}>
                    <IconSymbol
                      ios_icon_name={item.ios}
                      android_material_icon_name={item.android}
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.premiumFeatureLabel}>{item.label}</Text>
                    <Text style={styles.premiumFeatureDesc}>{item.desc}</Text>
                  </View>
                </View>
                {index < PREMIUM_HERO_FEATURES.length - 1 && (
                  <View style={styles.premiumFeatureSeparator} />
                )}
              </View>
            ))}
          </View>

          {/* ── CTA ── */}
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: DARK_BG }}>
            <TouchableOpacity
              style={styles.premiumCtaButton}
              onPress={() => {
                console.log('[Subscription] Premium Continue button pressed');
                router.back();
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.premiumCtaText}>{t('subscription.continueButton')}</Text>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron-right"
                size={18}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            <View style={styles.premiumSecureFooter}>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={12}
                color="rgba(255,255,255,0.5)"
              />
              <Text style={styles.premiumSecureFooterText}>
                {t('subscription.securePrivate')}
              </Text>
            </View>
          </SafeAreaView>
        </ScrollView>
      </View>
    );
  }

  const monthlyPrice = resolvedMonthlyPkg?.product?.priceString ?? '';
  const yearlyPrice = resolvedYearlyPkg?.product?.priceString ?? '';

  // Use the store's localized equivalent; never assume a dollar currency.
  const yearlyMonthlyEquiv = resolvedYearlyPkg?.product?.pricePerMonthString;
  const effectivePlan = activePlan === 'yearly' && !resolvedYearlyPkg
    ? 'monthly'
    : activePlan;
  const selectedPkg = effectivePlan === 'yearly' ? resolvedYearlyPkg : resolvedMonthlyPkg;

  const handleApplyAffiliateCode = async () => {
    const code = affiliateCodeInput.trim().toUpperCase();
    if (!code) return;
    console.log('[Subscription] Apply affiliate code pressed:', code);
    setAffiliateCodeStatus('checking');
    try {
      const result = await validateAndAttributeCode(code);
      if (result.valid) {
        console.log('[Subscription] Affiliate code valid:', code, 'redemption_url:', result.redemption_url);
        setAffiliateCodeStatus('valid');
        setAffiliateCodeApplied(code);
        setRedemptionUrl(result.redemption_url ?? null);
      } else {
        console.log('[Subscription] Affiliate code invalid:', code, 'error:', result.error);
        setAffiliateCodeStatus('invalid');
      }
    } catch (e) {
      console.error('[Subscription] Error applying affiliate code:', e);
      setAffiliateCodeStatus('invalid');
    }
  };

  const handleSubscribe = () => {
    console.log('[Subscription] Subscribe button pressed, plan:', activePlan, selectedPkg?.identifier, 'redemptionUrl:', redemptionUrl);
    if (!selectedPkg) return;
    trackEvent('trial_clicked', { plan: selectedPkg.identifier });

    if (redemptionUrl) {
      Alert.alert(
        t('subscription.openingDiscount'),
        t('subscription.openingDiscountMsg'),
        [
          {
            text: t('subscription.openDiscountBtn'),
            onPress: () => {
              console.log('[Subscription] Opening redemption URL:', redemptionUrl);
              Linking.openURL(redemptionUrl);
            },
          },
          {
            text: t('subscription.subscribeNormally'),
            onPress: () => handlePurchase(selectedPkg),
          },
        ]
      );
      return;
    }

    handlePurchase(selectedPkg);
  };

  const ctaLabel = t('subscription.getStarted');

  const ALL_FEATURES = [
    'localization.shared.allFeature0',
    'localization.shared.allFeature1',
    'localization.shared.allFeature2',
    'localization.shared.allFeature3',
    'localization.shared.allFeature4',
    'localization.shared.allFeature5',
    'localization.shared.allFeature6',
    'localization.shared.allFeature7',
    'localization.shared.allFeature8',
    'localization.shared.allFeature9',
  ];

  const contextualTop = getPaywallTop(source, i18n.resolvedLanguage ?? i18n.language);

  const NEW_FEATURES = [
    {
      ios: 'brain.head.profile',
      android: 'psychology' as const,
      title: contextualTop?.benefits[0].title ?? t('subscription.sellingPoint1Title'),
      desc: contextualTop?.benefits[0].desc ?? t('subscription.sellingPoint1Desc'),
    },
    {
      ios: 'fork.knife.circle.fill',
      android: 'set-meal' as const,
      title: contextualTop?.benefits[1].title ?? t('subscription.sellingPoint2Title'),
      desc: contextualTop?.benefits[1].desc ?? t('subscription.sellingPoint2Desc'),
    },
    {
      ios: 'arrow.triangle.2.circlepath',
      android: 'autorenew' as const,
      title: contextualTop?.benefits[2].title ?? t('subscription.stayOnTrack'),
      desc: contextualTop?.benefits[2].desc ?? t('subscription.sellingPoint3Desc'),
    },
  ];

  return (
    <>
      <View style={styles.newRoot}>
        <StatusBar style="light" />
        <ScrollView ref={offerViewport} showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── 1. HERO ── */}
          <View style={{ backgroundColor: '#000', flexDirection: 'row', paddingBottom: 0 }}>

            {/* LEFT 60% — text block */}
            <View style={{ width: '55%', justifyContent: 'flex-start', paddingLeft: 20, paddingRight: 8, paddingTop: 72, paddingBottom: 20 }}>
              <Text style={styles.newHeroLine1}>{contextualTop?.line1 ?? t('subscription.heroLine1')}</Text>
              <Text style={styles.newHeroLine2}>{contextualTop?.line2 ?? t('subscription.heroLine2')}</Text>
              <Text style={styles.newHeroSubtitle}>
                {contextualTop?.subtitle ?? t('subscription.heroSubtitle')}
              </Text>
            </View>

            {/* RIGHT 45% — image, no rounding, fills full height */}
            <Image
              source={require('@/assets/images/b58668e0-da07-4d39-82de-0e5d5f7d3ab9.jpeg')}
              style={{ width: '45%', aspectRatio: 0.7 }}
              resizeMode="contain"
            />

          </View>

          {/* ── 2. FEATURE CARDS ── */}
          <View style={styles.newFeatureCard}>
            {NEW_FEATURES.map((item, index) => (
              <View key={item.title}>
                <View style={styles.newFeatureRow}>
                  <View style={styles.newFeatureIconCircle}>
                    <IconSymbol
                      ios_icon_name={item.ios}
                      android_material_icon_name={item.android}
                      size={20}
                      color="#5B9AA8"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.newFeatureTitle}>{item.title}</Text>
                    <Text style={styles.newFeatureDesc}>{item.desc}</Text>
                  </View>
                </View>
                {index < NEW_FEATURES.length - 1 && (
                  <View style={styles.newFeatureSeparator} />
                )}
              </View>
            ))}
          </View>

          {/* ── See everything included dropdown ── */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6 }}
            onPress={() => setShowAllFeatures(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#5B9AA8', fontSize: 14, fontWeight: '500' }}>
              {t('subscription.seeEverything')}
            </Text>
            <Text style={{ color: '#5B9AA8', fontSize: 12 }}>
              {showAllFeatures ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {showAllFeatures && (
            <View style={{ backgroundColor: '#111', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 16 }}>
              {ALL_FEATURES.map((feature, index) => (
                <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: index < ALL_FEATURES.length - 1 ? 12 : 0 }}>
                  <Text style={{ color: '#5B9AA8', fontSize: 15, fontWeight: '700', marginTop: 1 }}>✓</Text>
                  <Text style={{ color: '#ccc', fontSize: 14, flex: 1, lineHeight: 20 }}>{t(feature)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── 3. PLANS ── */}
          <View style={styles.newPlansSection}>
            {([
              { plan: 'yearly', pkg: resolvedYearlyPkg, price: yearlyPrice },
              { plan: 'monthly', pkg: resolvedMonthlyPkg, price: monthlyPrice },
            ] as const).map(({ plan, pkg, price }) => pkg && (
              <TouchableOpacity
                key={plan}
                ref={cardRef(pkg)}
                style={[
                  styles.nativePlanCard,
                  effectivePlan === plan && styles.nativePlanCardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: effectivePlan === plan, disabled: purchasing }}
                onPress={() => setActivePlan(plan)}
                disabled={purchasing}
                activeOpacity={0.85}
              >
                <View style={styles.nativePlanHeading}>
                  <View style={[styles.radioOuter, effectivePlan === plan && { borderColor: '#5B9AA8' }]}>
                    {effectivePlan === plan && <View style={[styles.radioInner, { backgroundColor: '#5B9AA8' }]} />}
                  </View>
                  <Text style={styles.nativePlanName}>{t(`subscription.${plan}`)}</Text>
                </View>
                <Text style={styles.nativePlanPrice}>{price}</Text>
                <Text style={styles.nativePlanPeriod}>
                  {t(plan === 'yearly' ? 'subscription.billedYearly' : 'subscription.billedMonthly')}
                </Text>
                {plan === 'yearly' && yearlyMonthlyEquiv && (
                  <Text style={styles.nativePlanEquivalent}>
                    {'≈ '}{yearlyMonthlyEquiv}{t('subscription.perMonth')}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Native code entry is temporarily hidden; attribution and purchase handlers are retained. */}

          <View style={styles.newCtaSection}>
            <TouchableOpacity
              style={[styles.newCtaButton, purchasing && { opacity: 0.7 }]}
              onPress={handleSubscribe}
              disabled={purchasing || !selectedPkg}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.newCtaButtonText}>{ctaLabel}</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* ── 5. FOOTER ── */}
          <View style={styles.newFooter}>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => {
                console.log('[Subscription] Restore Purchases pressed');
                handleRestore();
              }}
              disabled={loading}
            >
              <Text style={styles.darkRestoreText}>{t('subscription.restorePurchases')}</Text>
            </TouchableOpacity>

            <View style={styles.nativeLegalLinks}>
              <TouchableOpacity accessibilityRole="link" onPress={() => router.push('/terms-of-use-eula')} style={styles.nativeFooterLink}>
                <Text style={styles.nativeLegalText}>{t('subscription.subscriptionTerms')}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="link" onPress={() => router.push('/privacy-policy')} style={styles.nativeFooterLink}>
                <Text style={styles.nativeLegalText}>{t('subscription.privacyPolicy')}</Text>
              </TouchableOpacity>
            </View>
            {router.canGoBack() && (
              <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.nativeFooterLink}>
                <Text style={styles.nativeLegalText}>{t('subscription.goBack')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.disclaimerContainer}>
              <Text style={styles.darkDisclaimerText}>
                {t('subscription.disclaimer')}
              </Text>
            </View>
          </View>

        </ScrollView>
      </View>

      {/* Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowSuccessModal(false);
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: DARK_CARD }]}>
            <View style={[styles.successIconCircle, { backgroundColor: colors.primary + '20' }]}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={64}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.modalTitle, { color: '#fff' }]}>
              {t('subscription.welcomePremium')}
            </Text>
            <Text style={[styles.modalMessage, { color: 'rgba(255,255,255,0.6)' }]}>
              {t('subscription.welcomePremiumMessage')}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={async () => {
                console.log('[Subscription] Get Started pressed → navigating to coach tab');
                setShowSuccessModal(false);
                const { data: { user } } = await supabase.auth.getUser();
                if (user) await AsyncStorage.setItem(`first_launch_done_${user.id}`, 'true');
                router.replace('/(tabs)/coach');
              }}
            >
              <Text style={styles.modalButtonText}>{t('subscription.getStarted')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Shared / non-dark screens ──────────────────────────────────────────────
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.body,
    flex: 1,
  },
  button: {
    width: '100%',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  webMessageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  webMessageTitle: {
    ...typography.h1,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  webMessageText: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresList: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  premiumStatusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  premiumBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  premiumTitle: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  premiumSubtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  featuresCard: {
    width: '100%',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    paddingBottom: spacing.xl,
  },
  featuresTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  successIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalMessage: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  modalButton: {
    width: '100%',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // ── Dark paywall screen ────────────────────────────────────────────────────

  // Hero text
  heroTextContainer: {
    marginBottom: spacing.sm,
  },
  heroTitleWhite: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitleWhite: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  // Icon grid
  iconGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconGridItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  iconGridCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGridCircleDefault: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  iconGridCircleSelected: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  iconGridLabel: {
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  iconGridLabelDefault: {
    color: 'rgba(255,255,255,0.55)',
  },
  iconGridLabelSelected: {
    color: '#fff',
    fontWeight: '700',
  },

  // Feature description card
  featureDescCard: {
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.md,
    minHeight: 38,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureDescText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },

  // Plan section
  choosePlanTitleDark: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  darkPlanCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: DARK_CARD,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  darkPlanCardSelected: {
    borderColor: '#fff',
    backgroundColor: DARK_CARD_SELECTED,
  },
  planCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  darkPlanCardTitle: {
    ...typography.bodyBold,
    fontSize: 15,
    color: '#fff',
    marginBottom: 1,
  },
  darkPlanCardPrice: {
    ...typography.body,
    fontSize: 14,
    color: '#fff',
    marginBottom: 1,
  },
  darkPlanCardSub: {
    ...typography.caption,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 2,
  },
  planCardTag: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  saveBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginBottom: 6,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Cancel text
  darkCancelText: {
    textAlign: 'center',
    ...typography.caption,
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
    marginBottom: 4,
  },

  // CTA
  ctaButtonDark: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xs,
    backgroundColor: '#fff',
  },
  ctaButtonDarkText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },

  // Restore
  restoreButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  darkRestoreText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '500',
  },

  // Disclaimer
  disclaimerContainer: {
    marginTop: spacing.xs,
  },
  darkDisclaimerText: {
    ...typography.caption,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 19,
  },

  // ── New paywall layout ─────────────────────────────────────────────────────
  newRoot: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Hero
  newHeroContainer: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  newHeroImage: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  newHeroGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
  },
  newHeroCloseArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    alignItems: 'flex-end',
    zIndex: 10,
  },
  newHeroCloseBtn: {
    marginTop: 8,
    marginRight: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newHeroCloseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  newHeroTextBlock: {
    position: 'absolute',
    top: 80,
    left: 20,
    paddingRight: 16,
  },
  newHeroLine1: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 32,
  },
  newHeroLine2: {
    fontSize: 28,
    fontWeight: '800',
    color: '#5B9AA8',
    lineHeight: 32,
  },
  newHeroSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    maxWidth: 260,
  },

  // Feature card
  newFeatureCard: {
    backgroundColor: '#111',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginHorizontal: 16,
    marginTop: 0,
    padding: 20,
  },
  newFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  newFeatureIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(91,154,168,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(91,154,168,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newFeatureTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  newFeatureDesc: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },
  newFeatureSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  // Plans section
  newPlansSection: {
    marginHorizontal: 16,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  nativePlanCard: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#444',
    backgroundColor: '#111',
    gap: 6,
  },
  nativePlanCardSelected: {
    borderColor: '#5B9AA8',
    backgroundColor: '#14262A',
  },
  nativePlanHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nativePlanName: {
    flex: 1,
    minWidth: 0,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nativePlanPrice: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
  },
  nativePlanPeriod: {
    color: '#fff',
    fontSize: 14,
  },
  nativePlanEquivalent: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  nativeLegalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 16,
  },
  nativeFooterLink: {
    minHeight: 44,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nativeLegalText: {
    color: '#80BDCB',
    fontSize: 14,
    textAlign: 'center',
  },

  // CTA
  newCtaSection: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  newCtaButton: {
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    backgroundColor: '#5B9AA8',
  },
  newCtaButtonText: {
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Footer
  newFooter: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingBottom: 32,
  },

  // ── Premium hero screen (isPremium branch) ─────────────────────────────────
  premiumRoot: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  premiumHero: {
    height: 360,
    width: '100%',
    justifyContent: 'space-between',
  },
  heroBottomContent: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.md,
    gap: spacing.sm,
  },
  premiumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  premiumPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  heroHeadline: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  heroHeadlineAccent: {
    color: colors.primary,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 21,
  },
  premiumFeaturesCard: {
    backgroundColor: DARK_CARD,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  premiumFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  premiumFeatureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary + '1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumFeatureLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  premiumFeatureDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  premiumFeatureSeparator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: spacing.md,
  },
  premiumCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  premiumCtaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  premiumSecureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  premiumSecureFooterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },

  // ── Affiliate code section ─────────────────────────────────────────────────
  affiliateCodeSection: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
  },
  affiliateCodeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  affiliateCodeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  affiliateCodeInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1,
  },
  affiliateCodeApplyBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  affiliateCodeApplyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  affiliateCodeSuccess: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  affiliateCodeError: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },

});

