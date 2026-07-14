
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
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { trackEvent } from '@/utils/analytics';
import Constants from 'expo-constants';
import Purchases, { LOG_LEVEL, isPurchasesAvailable } from '@/utils/purchases';

function loadPurchases(): { Purchases: any; LOG_LEVEL: any } {
  if (!isPurchasesAvailable) return { Purchases: null, LOG_LEVEL: null };
  return { Purchases, LOG_LEVEL };
}
// Type aliases so we don't import from the native module
type PurchasesPackage = any;
type PurchasesOffering = any;
type CustomerInfo = any;

// Premium features list (used in web + isPremium views)
const PREMIUM_FEATURES = [
  'Snap a photo to estimate calories & macros instantly',
  'Personalized meal plans for fat loss, muscle gain, or maintenance',
  'Generate grocery lists automatically from your plan',
  'Track progress photos & body measurements',
  'No ads. No invasive tracking.',
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

const ICON_GRID_ITEMS: FeatureItem[] = [
  {
    key: 'snap',
    icon_ios: 'camera.fill',
    icon_android: 'camera-alt',
    label: 'Snap & Track',
    description: 'Snap a photo to estimate calories & macros instantly.',
  },
  {
    key: 'mealplans',
    icon_ios: 'calendar',
    icon_android: 'calendar-today',
    label: 'Meal Plans',
    description: 'Get personalized meal plans tailored to your goals.',
  },
  {
    key: 'progress',
    icon_ios: 'chart.line.uptrend.xyaxis',
    icon_android: 'trending-up',
    label: 'Progress',
    description: 'Track your progress with detailed charts and insights.',
  },
  {
    key: 'noads',
    icon_ios: 'sparkles',
    icon_android: 'auto-awesome',
    label: 'No Ads',
    description: 'Enjoy a clean, ad-free experience.',
  },
  {
    key: 'grocery',
    icon_ios: 'cart.fill',
    icon_android: 'shopping-cart',
    label: 'Grocery List',
    description: 'Auto-generate grocery lists from your meal plans.',
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { width: screenWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<'monthly' | 'yearly'>('yearly');
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey | null>(null);
  const { autoStart } = useLocalSearchParams<{ autoStart?: string }>();
  const autoStartFiredRef = React.useRef(false);

  // Initialize RevenueCat and fetch offerings
  const initializeRevenueCat = async () => {
    if (Platform.OS === 'web') {
      console.log('[Subscription] Web platform - RevenueCat not available');
      setLoading(false);
      return;
    }

    const { Purchases, LOG_LEVEL } = loadPurchases();

    if (!Purchases) {
      console.log('[Subscription] Purchases SDK not available on this platform');
      setLoading(false);
      return;
    }

    try {
      console.log('[Subscription] ========== INITIALIZING REVENUECAT ==========');

      // Get RevenueCat configuration from app.json
      const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
      console.log('[Subscription] RevenueCat config:', {
        hasConfig: !!revenueCatConfig,
        iosApiKey: revenueCatConfig?.iosApiKey?.substring(0, 10) + '...',
        androidApiKey: revenueCatConfig?.androidApiKey?.substring(0, 10) + '...',
        offeringIdentifier: revenueCatConfig?.offeringIdentifier,
        entitlementIdentifier: revenueCatConfig?.entitlementIdentifier,
      });

      const apiKey = Platform.select({
        ios: revenueCatConfig?.iosApiKey,
        android: revenueCatConfig?.androidApiKey,
      });

      console.log('[Subscription] Platform:', Platform.OS);
      console.log('[Subscription] API Key exists:', !!apiKey);
      console.log('[Subscription] API Key starts with:', apiKey?.substring(0, 10));

      // Check if API key is configured
      if (!apiKey) {
        const errorMsg = 'RevenueCat API key not found in configuration';
        console.error('[Subscription] ❌', errorMsg);
        setErrorMessage(errorMsg);
        setLoading(false);
        return;
      }

      if (apiKey.includes('YOUR')) {
        const errorMsg = `RevenueCat API key not configured for ${Platform.OS}. Please add your ${Platform.OS === 'ios' ? 'iOS' : 'Android'} API key to app.json`;
        console.error('[Subscription] ❌', errorMsg);
        setErrorMessage(errorMsg);
        setLoading(false);
        return;
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Subscription] ❌ No user found');
        setErrorMessage('Please log in to view subscriptions');
        setLoading(false);
        return;
      }

      console.log('[Subscription] User ID:', user.id);
      console.log('[Subscription] User Email:', user.email);

      // Configure RevenueCat
      console.log('[Subscription] Configuring RevenueCat SDK...');
      await Purchases.configure({
        apiKey,
        appUserID: user.id,
      });

      // Enable debug logs
      await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      console.log('[Subscription] ✅ RevenueCat configured successfully');

      // CRITICAL: Set user attributes (email and display name) for RevenueCat dashboard
      console.log('[Subscription] 📝 Setting user attributes for RevenueCat dashboard...');

      const userEmail = user.email;

      // Get user's name from the users table
      const { data: userData } = await supabase
        .from('users')
        .select('email')
        .eq('id', user.id)
        .maybeSingle();

      if (userEmail) {
        await Purchases.setEmail(userEmail);
        console.log('[Subscription] ✅ Email set in RevenueCat:', userEmail);
      }

      // Set display name (use email username as display name if no name available)
      const displayName = userData?.email || userEmail?.split('@')[0] || 'User';
      await Purchases.setDisplayName(displayName);
      console.log('[Subscription] ✅ Display name set in RevenueCat:', displayName);

      // Fetch offerings
      console.log('[Subscription] Fetching offerings...');
      const offeringsResponse = await Purchases.getOfferings();

      console.log('[Subscription] Offerings response:', {
        hasCurrent: !!offeringsResponse.current,
        currentIdentifier: offeringsResponse.current?.identifier,
        allOfferingsCount: Object.keys(offeringsResponse.all).length,
        allOfferingIds: Object.keys(offeringsResponse.all),
      });

      // Try to get the specific offering by identifier first
      const offeringIdentifier = revenueCatConfig?.offeringIdentifier;
      let targetOffering = offeringsResponse.current;

      if (offeringIdentifier && offeringsResponse.all[offeringIdentifier]) {
        console.log('[Subscription] Using specific offering:', offeringIdentifier);
        targetOffering = offeringsResponse.all[offeringIdentifier];
      } else if (offeringsResponse.current) {
        console.log('[Subscription] Using current offering:', offeringsResponse.current.identifier);
      } else if (Object.keys(offeringsResponse.all).length > 0) {
        // Use the first available offering
        const firstOfferingKey = Object.keys(offeringsResponse.all)[0];
        console.log('[Subscription] Using first available offering:', firstOfferingKey);
        targetOffering = offeringsResponse.all[firstOfferingKey];
      }

      if (targetOffering && targetOffering.availablePackages.length > 0) {
        console.log('[Subscription] ✅ Offering found:', {
          identifier: targetOffering.identifier,
          packagesCount: targetOffering.availablePackages.length,
          packageIdentifiers: targetOffering.availablePackages.map((p: any) => p.identifier),
        });

        setOfferings(targetOffering);
        setPackages(targetOffering.availablePackages);

        // Log package details
        targetOffering.availablePackages.forEach((pkg: any, index: number) => {
          console.log(`[Subscription] Package ${index + 1}:`, {
            identifier: pkg.identifier,
            packageType: pkg.packageType,
            productId: pkg.product.identifier,
            title: pkg.product.title,
            price: pkg.product.priceString,
          });
        });
      } else {
        console.warn('[Subscription] ⚠️ No offerings or packages available');
        console.log('[Subscription] Debug info:', {
          hasOfferings: Object.keys(offeringsResponse.all).length > 0,
          offeringIds: Object.keys(offeringsResponse.all),
          currentOffering: offeringsResponse.current?.identifier,
          configuredOffering: offeringIdentifier,
        });

        const errorMsg = `No subscription plans currently available.\n\nPlease ensure:\n1. Products are created in RevenueCat\n2. Offering "${offeringIdentifier || 'default'}" is configured\n3. Products are linked to the offering\n\nCurrent offerings: ${Object.keys(offeringsResponse.all).join(', ') || 'none'}`;
        setErrorMessage(errorMsg);
      }

      // Check current premium status
      console.log('[Subscription] Checking customer info...');
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      const entitlementIdentifier = revenueCatConfig?.entitlementIdentifier || 'Macrogoal Pro';
      const hasActiveEntitlement = info.entitlements.active[entitlementIdentifier]?.isActive || false;

      console.log('[Subscription] Customer info:', {
        hasActiveEntitlements: Object.keys(info.entitlements.active).length > 0,
        activeEntitlements: Object.keys(info.entitlements.active),
        targetEntitlement: entitlementIdentifier,
        isPremium: hasActiveEntitlement,
      });

      setIsPremium(hasActiveEntitlement);

    } catch (error: any) {
      console.error('[Subscription] ❌ RevenueCat initialization error:', error);
      console.error('[Subscription] Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });

      const errorMsg = `Failed to initialize subscriptions:\n\n${error.message || 'Unknown error'}\n\nPlease check:\n1. RevenueCat API keys are correct\n2. Products are configured in RevenueCat dashboard\n3. Internet connection is active`;
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
      console.log('[Subscription] ========== INITIALIZATION COMPLETE ==========');
    }
  };

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  // Auto-start yearly purchase when coming from onboarding
  useEffect(() => {
    if (autoStart !== 'true' || packages.length === 0 || autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    const yearlyPkg =
      packages.find((p: any) => p.packageType === 'ANNUAL') ??
      packages.find((p: any) =>
        p.identifier.toLowerCase().includes('annual') ||
        p.identifier.toLowerCase().includes('yearly')
      );
    const monthlyPkg =
      packages.find((p: any) => p.packageType === 'MONTHLY') ??
      packages.find((p: any) => p.identifier.toLowerCase().includes('monthly')) ??
      packages[0];
    const targetPkg = yearlyPkg ?? monthlyPkg;
    if (targetPkg) {
      setActivePlan(yearlyPkg ? 'yearly' : 'monthly');
      console.log('[Subscription] Auto-starting yearly purchase from onboarding:', targetPkg.identifier);
      setTimeout(() => handlePurchase(targetPkg), 500);
    }
  }, [packages, autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle purchase
  const handlePurchase = async (pkg: PurchasesPackage) => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available on Web',
        'In-app purchases are only available on iOS and Android. Please use the mobile app to subscribe.'
      );
      return;
    }

    if (purchasing) {
      console.log('[Subscription] Purchase already in progress');
      return;
    }

    const { Purchases } = loadPurchases();

    try {
      console.log('[Subscription] ========== STARTING PURCHASE ==========');
      console.log('[Subscription] Package:', {
        identifier: pkg.identifier,
        productId: pkg.product.identifier,
        price: pkg.product.priceString,
      });

      setPurchasing(true);
      setSelectedPackage(pkg.identifier);

      // Make purchase through RevenueCat
      const { customerInfo, productIdentifier } = await Purchases.purchasePackage(pkg);

      console.log('[Subscription] ✅ Purchase successful');
      console.log('[Subscription] Product:', productIdentifier);
      console.log('[Subscription] Active entitlements:', Object.keys(customerInfo.entitlements.active));

      // Check if premium entitlement is now active
      const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
      const entitlementIdentifier = revenueCatConfig?.entitlementIdentifier || 'Macrogoal Pro';
      const hasActiveEntitlement = customerInfo.entitlements.active[entitlementIdentifier]?.isActive || false;

      setIsPremium(hasActiveEntitlement);
      setCustomerInfo(customerInfo);

      if (hasActiveEntitlement) {
        console.log('[Subscription] ✅ Premium access granted');
        setShowSuccessModal(true);
      } else {
        console.warn('[Subscription] ⚠️ Purchase completed but premium not active');
        Alert.alert(
          'Purchase Completed',
          'Your purchase was successful. Premium access will be activated shortly.'
        );
      }

    } catch (error: any) {
      console.error('[Subscription] ❌ Purchase error:', error);
      console.error('[Subscription] Error details:', {
        message: error.message,
        code: error.code,
        userCancelled: error.userCancelled,
      });

      // Handle specific error codes
      if (error.userCancelled) {
        console.log('[Subscription] User cancelled purchase');
        // Don't show alert for user cancellation
      } else if (error.code === 'PRODUCT_ALREADY_PURCHASED') {
        Alert.alert(
          'Already Subscribed',
          'You already have an active subscription. Use "Restore Purchases" if you don\'t see your premium features.'
        );
      } else if (error.code === 'NETWORK_ERROR') {
        Alert.alert(
          'Network Error',
          'Unable to connect to the store. Please check your internet connection and try again.'
        );
      } else {
        Alert.alert(
          'Purchase Failed',
          error.message || 'Unable to complete purchase. Please try again.'
        );
      }
    } finally {
      setPurchasing(false);
      setSelectedPackage(null);
      console.log('[Subscription] ========== PURCHASE COMPLETE ==========');
    }
  };

  // Restore purchases
  const handleRestore = async () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Not Available on Web',
        'Purchase restoration is only available on iOS and Android. Please use the mobile app.'
      );
      return;
    }

    const { Purchases } = loadPurchases();

    try {
      console.log('[Subscription] ========== RESTORING PURCHASES ==========');
      setLoading(true);

      // Restore purchases through RevenueCat
      const info = await Purchases.restorePurchases();
      console.log('[Subscription] ✅ Purchases restored');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));

      setCustomerInfo(info);

      const revenueCatConfig = Constants.expoConfig?.extra?.revenueCat;
      const entitlementIdentifier = revenueCatConfig?.entitlementIdentifier || 'Macrogoal Pro';
      const hasActiveEntitlement = info.entitlements.active[entitlementIdentifier]?.isActive || false;

      setIsPremium(hasActiveEntitlement);

      if (hasActiveEntitlement) {
        Alert.alert(
          'Success',
          'Your purchases have been restored! You now have access to all premium features.'
        );
      } else {
        Alert.alert(
          'No Active Subscriptions',
          'No active subscriptions were found for this Apple/Google account. If you purchased a subscription with a different app account, you\'ll need to log in to that account to access premium features.'
        );
      }

    } catch (error: any) {
      console.error('[Subscription] ❌ Restore error:', error);
      Alert.alert(
        'Restore Failed',
        error.message || 'Failed to restore purchases. Please try again.'
      );
    } finally {
      setLoading(false);
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
            Go Premium
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
            Premium Subscriptions
          </Text>
          <Text style={[styles.webMessageText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            In-app purchases are only available on iOS and Android devices.
          </Text>
          <Text style={[styles.webMessageText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Please download the mobile app to subscribe to Premium and unlock:
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
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: DARK_BG }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: '#fff' }]}>
            Loading subscription options...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error state if there's an error
  if (errorMessage) {
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
            Go Premium
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
            Unable to Load Subscriptions
          </Text>
          <Text style={[styles.errorMessage, { color: 'rgba(255,255,255,0.6)' }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }]}
            onPress={() => {
              setErrorMessage(null);
              setLoading(true);
              initializeRevenueCat();
            }}
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: DARK_CARD, marginTop: spacing.md }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.buttonText, { color: '#fff' }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const PREMIUM_HERO_FEATURES = [
    { ios: 'camera.fill', android: 'camera-alt', label: 'AI Snap & Track', desc: 'Snap a photo to estimate calories & macros instantly.' },
    { ios: 'list.clipboard.fill', android: 'assignment', label: 'Custom Meal Plans', desc: 'Personalized plans for fat loss, muscle gain, or maintenance.' },
    { ios: 'cart.fill', android: 'shopping-cart', label: 'Auto Grocery Lists', desc: 'Generate grocery lists automatically from your plan.' },
    { ios: 'chart.line.uptrend.xyaxis', android: 'trending-up', label: 'Progress Tracking', desc: 'Track progress photos & body measurements over time.' },
    { ios: 'checkmark.shield.fill', android: 'verified-user', label: 'No Ads, No Tracking', desc: 'A clean, private experience — just for you.' },
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
                <Text style={styles.premiumPillText}>PREMIUM</Text>
              </View>

              {/* Headline */}
              <View>
                <Text style={styles.heroHeadline}>{"You're"}</Text>
                <Text style={styles.heroHeadlineAccent}>{"Premium."}</Text>
              </View>

              {/* Subtitle */}
              <Text style={styles.heroSubtitle}>
                Enjoy unlimited access to all premium features.
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
              <Text style={styles.premiumCtaText}>Continue</Text>
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
                Secure &amp; private. Your data is always protected.
              </Text>
            </View>
          </SafeAreaView>
        </ScrollView>
      </View>
    );
  }

  // Resolve packages
  const monthlyPkg =
    packages.find((p: any) => p.packageType === 'MONTHLY') ??
    packages.find((p: any) => p.identifier.toLowerCase().includes('monthly'));

  const yearlyPkg =
    packages.find((p: any) => p.packageType === 'ANNUAL') ??
    packages.find((p: any) =>
      p.identifier.toLowerCase().includes('annual') ||
      p.identifier.toLowerCase().includes('yearly')
    );

  const resolvedMonthlyPkg = monthlyPkg ?? (yearlyPkg ? undefined : packages[0]);
  const resolvedYearlyPkg = yearlyPkg;

  const monthlyPrice = resolvedMonthlyPkg?.product?.priceString ?? '';
  const yearlyPrice = resolvedYearlyPkg?.product?.priceString ?? '';

  const yearlyRawPrice = resolvedYearlyPkg?.product?.price;
  const yearlyMonthlyEquiv = yearlyRawPrice
    ? `$${(Number(yearlyRawPrice) / 12).toFixed(2)}/mo`
    : null;

  const selectedPkg = activePlan === 'yearly' ? resolvedYearlyPkg : resolvedMonthlyPkg;

  const handleSubscribe = () => {
    console.log('[Subscription] Subscribe button pressed, plan:', activePlan, selectedPkg?.identifier);
    if (!selectedPkg) return;
    trackEvent('trial_clicked', { plan: selectedPkg.identifier });
    handlePurchase(selectedPkg);
  };

  const ctaLabel = activePlan === 'yearly' ? 'Start Free Trial' : 'Subscribe Monthly';

  const HERO_HEIGHT = 480;

  const NEW_FEATURES = [
    {
      ios: 'fork.knife',
      android: 'restaurant' as const,
      title: 'Eat the foods you love',
      desc: 'No boring diets. Just flexible eating that fits your life.',
    },
    {
      ios: 'chart.line.uptrend.xyaxis',
      android: 'trending-up' as const,
      title: 'Lose weight every week',
      desc: 'A plan that adapts to you and delivers real results.',
    },
    {
      ios: 'trophy.fill',
      android: 'emoji-events' as const,
      title: 'Feel confident in your body again',
      desc: 'Look better, feel better, and live better.',
    },
  ];

  return (
    <>
      <View style={styles.newRoot}>
        <StatusBar style="light" />
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

          {/* ── 1. HERO ── */}
          <View style={{ height: HERO_HEIGHT, backgroundColor: '#000', flexDirection: 'row' }}>

            {/* LEFT 60% — text block */}
            <View style={{ width: '60%', justifyContent: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 60 }}>
              <Text style={styles.newHeroLine1}>Finally lose</Text>
              <Text style={styles.newHeroLine2}>the weight.</Text>
              <Text style={styles.newHeroSubtitle}>
                {'Your personalized plan\ntells you exactly what to eat,\ntracks everything automatically,\nand keeps you consistent.'}
              </Text>
            </View>

            {/* RIGHT 40% — image, no rounding, fills full height */}
            <Image
              source={require('@/assets/images/d6609695-3248-42d7-826b-091b224ca0a8.jpeg')}
              style={{ width: '40%', height: HERO_HEIGHT }}
              resizeMode="cover"
            />

            {/* Close button — absolute overlay on top of entire hero */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 52, right: 12, zIndex: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                console.log('[Subscription] Close button pressed');
                router.back();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.newHeroCloseBtnText}>✕</Text>
            </TouchableOpacity>
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

          {/* ── 3. PLANS ── */}
          <View style={styles.newPlansSection}>
            <Text style={styles.choosePlanTitleDark}>Choose Your Plan</Text>

            {/* Yearly card */}
            {resolvedYearlyPkg && (
              <TouchableOpacity
                style={[
                  styles.darkPlanCard,
                  activePlan === 'yearly' && styles.darkPlanCardSelected,
                ]}
                onPress={() => {
                  console.log('[Subscription] Yearly plan selected');
                  setActivePlan('yearly');
                }}
                activeOpacity={0.85}
              >
                <View style={[styles.saveBadge, { backgroundColor: '#5B9AA8' }]}>
                  <Text style={styles.saveBadgeText}>✓ SAVE 58%</Text>
                </View>

                <View style={styles.planCardInner}>
                  <View style={[styles.radioOuter, activePlan === 'yearly' && { borderColor: '#5B9AA8' }]}>
                    {activePlan === 'yearly' && <View style={[styles.radioInner, { backgroundColor: '#5B9AA8' }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.darkPlanCardTitle}>7-Day Free Trial</Text>
                    <Text style={styles.darkPlanCardPrice}>{yearlyPrice}/year</Text>
                    {yearlyMonthlyEquiv && (
                      <Text style={styles.darkPlanCardSub}>Only {yearlyMonthlyEquiv}</Text>
                    )}
                    <Text style={[styles.planCardTag, { color: '#5B9AA8' }]}>
                      Most users choose this
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            {/* Monthly card */}
            {resolvedMonthlyPkg && (
              <TouchableOpacity
                style={[
                  styles.darkPlanCard,
                  activePlan === 'monthly' && styles.darkPlanCardSelected,
                ]}
                onPress={() => {
                  console.log('[Subscription] Monthly plan selected');
                  setActivePlan('monthly');
                }}
                activeOpacity={0.85}
              >
                <View style={styles.planCardInner}>
                  <View style={[styles.radioOuter, activePlan === 'monthly' && { borderColor: '#5B9AA8' }]}>
                    {activePlan === 'monthly' && <View style={[styles.radioInner, { backgroundColor: '#5B9AA8' }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.darkPlanCardPrice}>{monthlyPrice} monthly</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            <Text style={styles.darkCancelText}>Cancel anytime during trial</Text>
          </View>

          {/* ── 4. CTA BUTTON ── */}
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
              <Text style={styles.darkRestoreText}>Restore Purchases</Text>
            </TouchableOpacity>

            <View style={styles.disclaimerContainer}>
              <Text style={styles.darkDisclaimerText}>
                Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.
                You can manage your subscription in your App Store account settings.
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
              Welcome to Premium! 🎉
            </Text>
            <Text style={[styles.modalMessage, { color: 'rgba(255,255,255,0.6)' }]}>
              You now have access to all premium features. Enjoy your enhanced experience!
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowSuccessModal(false);
                router.back();
              }}
            >
              <Text style={styles.modalButtonText}>Get Started</Text>
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
    paddingVertical: spacing.xs,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  darkRestoreText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
  },

  // Disclaimer
  disclaimerContainer: {
    marginTop: spacing.xs,
  },
  darkDisclaimerText: {
    ...typography.caption,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 12,
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
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 36,
  },
  newHeroLine2: {
    fontSize: 32,
    fontWeight: '800',
    color: '#5B9AA8',
    lineHeight: 36,
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
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
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
  },

  // CTA
  newCtaSection: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  newCtaButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    backgroundColor: '#5B9AA8',
  },
  newCtaButtonText: {
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

});
