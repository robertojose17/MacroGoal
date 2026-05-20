
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
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

// Premium features list
const PREMIUM_FEATURES = [
  {
    title: 'Snap a photo to estimate',
    description: 'calories & macros instantly',
  },
  {
    title: 'Personalized meal plans for',
    description: 'fat loss, muscle gain, or maintenance',
  },
  {
    title: 'Generate grocery lists',
    description: 'automatically from your plan',
  },
  {
    title: 'Track progress photos &',
    description: 'body measurements',
  },
  {
    title: 'No ads. No invasive tracking.',
    description: '',
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      // This ensures the user's email and name appear in the RevenueCat dashboard instead of random numbers
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
          packageIdentifiers: targetOffering.availablePackages.map(p => p.identifier),
        });

        setOfferings(targetOffering);
        setPackages(targetOffering.availablePackages);

        // Log package details
        targetOffering.availablePackages.forEach((pkg, index) => {
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

  // Auto-start monthly purchase when coming from onboarding
  useEffect(() => {
    if (autoStart !== 'true' || packages.length === 0 || autoStartFiredRef.current) return;
    autoStartFiredRef.current = true;
    const monthlyPkg =
      packages.find((p: any) => p.packageType === 'MONTHLY') ??
      packages.find((p: any) => p.identifier.toLowerCase().includes('monthly')) ??
      packages[0];
    if (monthlyPkg) {
      console.log('[Subscription] Auto-starting monthly purchase from onboarding:', monthlyPkg.identifier);
      setTimeout(() => handlePurchase(monthlyPkg), 500);
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
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureText, { color: isDark ? colors.textDark : colors.text, fontWeight: '700' }]}>
                    {feature.title}
                  </Text>
                  <Text style={[styles.featureDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {feature.description}
                  </Text>
                </View>
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
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading subscription options...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error state if there's an error
  if (errorMessage) {
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

        <View style={styles.errorContainer}>
          <View style={[styles.iconCircle, { backgroundColor: colors.error + '20' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="error"
              size={64}
              color={colors.error}
            />
          </View>
          <Text style={[styles.errorTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Unable to Load Subscriptions
          </Text>
          <Text style={[styles.errorMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
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
            style={[styles.button, { backgroundColor: isDark ? colors.cardDark : colors.card, marginTop: spacing.md }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.buttonText, { color: isDark ? colors.textDark : colors.text }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isPremium) {
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
            Premium Status
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.premiumStatusContainer}>
          <View style={[styles.premiumBadge, { backgroundColor: colors.primary }]}>
            <IconSymbol
              ios_icon_name="star.fill"
              android_material_icon_name="star"
              size={48}
              color="#FFFFFF"
            />
          </View>
          <Text style={[styles.premiumTitle, { color: isDark ? colors.textDark : colors.text }]}>
            You&apos;re Premium!
          </Text>
          <Text style={[styles.premiumSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Enjoy unlimited access to all premium features
          </Text>

          <View style={[styles.featuresCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.featuresTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Your Premium Features
            </Text>
            {PREMIUM_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.primary}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureText, { color: isDark ? colors.textDark : colors.text, fontWeight: '700' }]}>
                    {feature.title}
                  </Text>
                  <Text style={[styles.featureDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {feature.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.buttonText, { color: isDark ? colors.textDark : colors.text }]}>
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const monthlyPkg =
    packages.find((p: any) => p.packageType === 'MONTHLY') ??
    packages.find((p: any) => p.identifier.toLowerCase().includes('monthly'));

  const yearlyPkg =
    packages.find((p: any) => p.packageType === 'ANNUAL') ??
    packages.find((p: any) =>
      p.identifier.toLowerCase().includes('annual') ||
      p.identifier.toLowerCase().includes('yearly')
    );

  // If only one package exists and it's not matched as yearly, show it as monthly
  const resolvedMonthlyPkg = monthlyPkg ?? (yearlyPkg ? undefined : packages[0]);
  const resolvedYearlyPkg = yearlyPkg;

  const monthlyPrice = resolvedMonthlyPkg?.product?.priceString ?? '';
  const yearlyPrice = resolvedYearlyPkg?.product?.priceString ?? '';

  const isPurchasingMonthly = purchasing && selectedPackage === resolvedMonthlyPkg?.identifier;
  const isPurchasingYearly = purchasing && selectedPackage === resolvedYearlyPkg?.identifier;

  const borderTopColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Text style={[styles.heroTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Track Meals in Seconds
          </Text>
          <Text style={[styles.heroSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            AI-powered nutrition tracking without the hassle.
          </Text>
        </View>

        <View style={styles.featuresListContainer}>
          {PREMIUM_FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={22}
                color={colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.featureText, { color: isDark ? colors.textDark : colors.text, fontWeight: '700' }]}>
                  {feature.title}
                </Text>
                <Text style={[styles.featureDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.disclaimerContainer}>
          <Text style={[styles.disclaimerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period.
            You can manage your subscription in your App Store account settings.
          </Text>
          <Text style={[styles.disclaimerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
            Note: Each app account requires its own subscription. If you have multiple accounts, you must purchase or restore the subscription for each account separately.
          </Text>
        </View>
      </ScrollView>

      {/* Sticky bottom buttons */}
      <View style={[styles.stickyBottom, { borderTopColor, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ paddingVertical: spacing.lg }} />
        ) : (
          <>
            {resolvedMonthlyPkg && (
              <TouchableOpacity
                style={[styles.stickyButton, { backgroundColor: colors.primary, marginBottom: spacing.lg }]}
                onPress={() => {
                  console.log('[Subscription] Monthly button pressed:', resolvedMonthlyPkg.identifier);
                  handlePurchase(resolvedMonthlyPkg);
                }}
                disabled={purchasing}
              >
                {isPurchasingMonthly ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.stickyButtonTextSolid}>
                    {'Monthly  •  '}
                    {monthlyPrice}
                    {'/mo'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {resolvedYearlyPkg && (
              <View style={[styles.stickyButtonWrapper, { marginBottom: spacing.sm }]}>
                <TouchableOpacity
                  style={[styles.stickyButton, styles.stickyButtonOutlined, { borderColor: colors.primary }]}
                  onPress={() => {
                    console.log('[Subscription] Yearly button pressed:', resolvedYearlyPkg.identifier);
                    handlePurchase(resolvedYearlyPkg);
                  }}
                  disabled={purchasing}
                >
                  {isPurchasingYearly ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.stickyButtonTextOutlined, { color: colors.primary }]}>
                      {'Yearly  •  '}
                      {yearlyPrice}
                      {'/yr'}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={[styles.bestValueBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.bestValueText}>BEST VALUE</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => {
                console.log('[Subscription] Restore Purchases pressed');
                handleRestore();
              }}
              disabled={loading}
            >
              <Text style={[styles.restoreButtonText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Restore Purchases
              </Text>
            </TouchableOpacity>
          </>
        )}
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
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={[styles.successIconCircle, { backgroundColor: colors.primary + '20' }]}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={64}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Welcome to Premium! 🎉
            </Text>
            <Text style={[styles.modalMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  featuresListContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stickyBottom: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  stickyButtonWrapper: {
    position: 'relative',
  },
  stickyButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 52,
  },
  stickyButtonOutlined: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  stickyButtonTextSolid: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  stickyButtonTextOutlined: {
    fontSize: 16,
    fontWeight: '700',
  },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  bestValueText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  planCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  popularPlan: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  popularText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  planTitle: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  planPrice: {
    ...typography.h1,
    marginBottom: spacing.xs,
  },
  planDescription: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  featuresContainer: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: 14,
  },
  featureText: {
    ...typography.body,
  },
  featureDescription: {
    ...typography.body,
    marginTop: 2,
  },
  subscribeButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  restoreButtonText: {
    ...typography.bodyBold,
    textDecorationLine: 'underline',
  },
  disclaimerContainer: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  disclaimerText: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
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
  button: {
    width: '100%',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonText: {
    ...typography.bodyBold,
    fontSize: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
});
