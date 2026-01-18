
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { useSubscription } from '@/hooks/useSubscription';
import * as InAppPurchases from 'expo-in-app-purchases';

// iOS Product IDs from App Store Connect
const PRODUCT_IDS = {
  monthly: 'macrogoal_premium_monthly',
  yearly: 'macrogoal_premium_yearly',
};

// Display pricing (update to match your actual prices)
const PRICING = {
  monthly: 9.99,
  yearly: 49.99,
};

// Calculate savings
const yearlySavings = Math.round((1 - (PRICING.yearly / 12) / PRICING.monthly) * 100);
const yearlyMonthlyEquivalent = (PRICING.yearly / 12).toFixed(2);

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isSubscribed, refreshSubscription } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<InAppPurchases.IAPItemDetails[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [iapConnected, setIapConnected] = useState(false);

  useEffect(() => {
    console.log('[Paywall iOS] Screen mounted, initializing IAP');
    initializeIAP();

    return () => {
      console.log('[Paywall iOS] Screen unmounted, disconnecting IAP');
      InAppPurchases.disconnectAsync().catch(err => 
        console.error('[Paywall iOS] Error disconnecting IAP:', err)
      );
    };
  }, []);

  const initializeIAP = async () => {
    try {
      console.log('[Paywall iOS] Connecting to App Store...');
      await InAppPurchases.connectAsync();
      setIapConnected(true);
      console.log('[Paywall iOS] ✅ Connected to App Store');

      console.log('[Paywall iOS] Fetching products:', Object.values(PRODUCT_IDS));
      const { results, responseCode } = await InAppPurchases.getProductsAsync(
        Object.values(PRODUCT_IDS)
      );

      console.log('[Paywall iOS] Products response code:', responseCode);
      console.log('[Paywall iOS] Products fetched:', results.length);

      if (responseCode === InAppPurchases.IAPResponseCode.OK) {
        setProducts(results);
        console.log('[Paywall iOS] ✅ Products loaded:', results.map(p => ({
          productId: p.productId,
          price: p.price,
          priceString: p.priceString,
        })));
      } else {
        console.error('[Paywall iOS] ❌ Failed to fetch products, response code:', responseCode);
        Alert.alert(
          'Products Unavailable',
          'Unable to load subscription options. Please try again later.'
        );
      }
    } catch (error) {
      console.error('[Paywall iOS] ❌ Error initializing IAP:', error);
      Alert.alert(
        'Connection Error',
        'Unable to connect to the App Store. Please check your internet connection and try again.'
      );
    } finally {
      setProductsLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!iapConnected) {
      Alert.alert('Not Connected', 'Please wait while we connect to the App Store...');
      return;
    }

    try {
      setLoading(true);
      console.log('[Paywall iOS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[Paywall iOS] 🚀 Starting purchase flow');
      console.log('[Paywall iOS] Selected plan:', selectedPlan);

      const productId = PRODUCT_IDS[selectedPlan];
      console.log('[Paywall iOS] Product ID:', productId);

      // Find the product
      const product = products.find(p => p.productId === productId);
      if (!product) {
        console.error('[Paywall iOS] ❌ Product not found:', productId);
        Alert.alert(
          'Product Not Found',
          'The selected subscription is not available. Please try again.'
        );
        return;
      }

      console.log('[Paywall iOS] 💳 Purchasing product:', {
        productId: product.productId,
        price: product.priceString,
      });

      // Purchase the product
      const { responseCode, results } = await InAppPurchases.purchaseItemAsync(productId);

      console.log('[Paywall iOS] Purchase response code:', responseCode);
      console.log('[Paywall iOS] Purchase results:', results);

      if (responseCode === InAppPurchases.IAPResponseCode.OK) {
        console.log('[Paywall iOS] ✅ Purchase successful!');
        
        // Process the purchase
        if (results && results.length > 0) {
          const purchase = results[0];
          console.log('[Paywall iOS] Processing purchase:', {
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            acknowledged: purchase.acknowledged,
          });

          // Finish the transaction
          await InAppPurchases.finishTransactionAsync(purchase, true);
          console.log('[Paywall iOS] ✅ Transaction finished');

          // Refresh subscription status
          await refreshSubscription();
          console.log('[Paywall iOS] ✅ Subscription status refreshed');

          Alert.alert(
            'Success!',
            'Your subscription is now active. Enjoy premium features!',
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        }
      } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
        console.log('[Paywall iOS] ℹ️ User canceled purchase');
      } else if (responseCode === InAppPurchases.IAPResponseCode.DEFERRED) {
        console.log('[Paywall iOS] ⏳ Purchase deferred (Ask to Buy)');
        Alert.alert(
          'Purchase Pending',
          'Your purchase is pending approval. You will be notified when it is approved.'
        );
      } else {
        console.error('[Paywall iOS] ❌ Purchase failed with code:', responseCode);
        Alert.alert(
          'Purchase Failed',
          'Unable to complete your purchase. Please try again.'
        );
      }

      console.log('[Paywall iOS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error: any) {
      console.error('[Paywall iOS] ❌ Error during purchase:', error);
      Alert.alert(
        'Purchase Error',
        error.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!iapConnected) {
      Alert.alert('Not Connected', 'Please wait while we connect to the App Store...');
      return;
    }

    try {
      setLoading(true);
      console.log('[Paywall iOS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[Paywall iOS] 🔄 Restoring purchases...');

      // Get purchase history
      const { responseCode, results } = await InAppPurchases.getPurchaseHistoryAsync();

      console.log('[Paywall iOS] Restore response code:', responseCode);
      console.log('[Paywall iOS] Purchase history:', results?.length || 0, 'items');

      if (responseCode === InAppPurchases.IAPResponseCode.OK) {
        if (results && results.length > 0) {
          console.log('[Paywall iOS] ✅ Found', results.length, 'previous purchases');
          
          // Process each purchase
          for (const purchase of results) {
            console.log('[Paywall iOS] Processing purchase:', {
              productId: purchase.productId,
              transactionId: purchase.transactionId,
            });

            // Finish the transaction
            await InAppPurchases.finishTransactionAsync(purchase, true);
          }

          // Refresh subscription status
          await refreshSubscription();
          console.log('[Paywall iOS] ✅ Subscription status refreshed');

          Alert.alert(
            'Restore Successful',
            'Your purchases have been restored. Your subscription is now active!',
            [
              {
                text: 'OK',
                onPress: () => router.back(),
              },
            ]
          );
        } else {
          console.log('[Paywall iOS] ℹ️ No previous purchases found');
          Alert.alert(
            'No Purchases Found',
            'We could not find any previous purchases to restore. If you believe this is an error, please contact support.'
          );
        }
      } else {
        console.error('[Paywall iOS] ❌ Restore failed with code:', responseCode);
        Alert.alert(
          'Restore Failed',
          'Unable to restore purchases. Please try again.'
        );
      }

      console.log('[Paywall iOS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error: any) {
      console.error('[Paywall iOS] ❌ Error restoring purchases:', error);
      Alert.alert(
        'Restore Error',
        error.message || 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Get product price string or fallback to hardcoded price
  const getProductPrice = (planType: 'monthly' | 'yearly'): string => {
    const product = products.find(p => p.productId === PRODUCT_IDS[planType]);
    return product?.priceString || `$${PRICING[planType]}`;
  };

  const isLoadingState = loading || productsLoading;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
            <IconSymbol
              ios_icon_name="sparkles"
              android_material_icon_name="auto_awesome"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.heroTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Unlock AI Features
          </Text>
          <Text style={[styles.heroSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Get instant meal estimates with our AI-powered nutrition assistant
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresSection}>
          <FeatureItem
            icon="sparkles"
            androidIcon="auto_awesome"
            title="AI Meal Estimator"
            description="Describe any meal and get instant calorie and macro estimates"
            isDark={isDark}
          />
          <FeatureItem
            icon="chart.bar.fill"
            androidIcon="bar_chart"
            title="Ingredient Breakdown"
            description="See detailed nutrition for each ingredient in your meals"
            isDark={isDark}
          />
          <FeatureItem
            icon="slider.horizontal.3"
            androidIcon="tune"
            title="Adjust Portions"
            description="Fine-tune ingredient quantities to match your exact portions"
            isDark={isDark}
          />
          <FeatureItem
            icon="bolt.fill"
            androidIcon="flash_on"
            title="Future AI Tools"
            description="Get early access to new AI-powered features as we release them"
            isDark={isDark}
          />
        </View>

        {/* Pricing Plans */}
        <View style={styles.pricingSection}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Choose Your Plan
          </Text>

          {productsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Loading subscription options...
              </Text>
            </View>
          ) : (
            <React.Fragment>
              {/* Monthly Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    backgroundColor: isDark ? colors.cardDark : colors.card,
                    borderColor: selectedPlan === 'monthly' ? colors.primary : (isDark ? colors.borderDark : colors.border),
                    borderWidth: selectedPlan === 'monthly' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedPlan('monthly')}
                activeOpacity={0.7}
              >
                <View style={styles.planHeader}>
                  <View style={styles.planTitleContainer}>
                    <Text style={[styles.planTitle, { color: isDark ? colors.textDark : colors.text }]}>
                      Monthly
                    </Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>
                      {getProductPrice('monthly')}<Text style={styles.planPeriod}>/month</Text>
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioButton,
                      {
                        borderColor: selectedPlan === 'monthly' ? colors.primary : (isDark ? colors.borderDark : colors.border),
                      },
                    ]}
                  >
                    {selectedPlan === 'monthly' && (
                      <View style={[styles.radioButtonInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </View>
                <Text style={[styles.planDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Perfect for trying out AI features
                </Text>
              </TouchableOpacity>

              {/* Yearly Plan */}
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    backgroundColor: isDark ? colors.cardDark : colors.card,
                    borderColor: selectedPlan === 'yearly' ? colors.primary : (isDark ? colors.borderDark : colors.border),
                    borderWidth: selectedPlan === 'yearly' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedPlan('yearly')}
                activeOpacity={0.7}
              >
                <View style={styles.badgeContainer}>
                  <View style={[styles.saveBadge, { backgroundColor: colors.accent }]}>
                    <Text style={styles.saveBadgeText}>Save {yearlySavings}%</Text>
                  </View>
                </View>
                <View style={styles.planHeader}>
                  <View style={styles.planTitleContainer}>
                    <Text style={[styles.planTitle, { color: isDark ? colors.textDark : colors.text }]}>
                      Yearly
                    </Text>
                    <Text style={[styles.planPrice, { color: colors.primary }]}>
                      {getProductPrice('yearly')}<Text style={styles.planPeriod}>/year</Text>
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radioButton,
                      {
                        borderColor: selectedPlan === 'yearly' ? colors.primary : (isDark ? colors.borderDark : colors.border),
                      },
                    ]}
                  >
                    {selectedPlan === 'yearly' && (
                      <View style={[styles.radioButtonInner, { backgroundColor: colors.primary }]} />
                    )}
                  </View>
                </View>
                <Text style={[styles.planDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Best value - just ${yearlyMonthlyEquivalent}/month
                </Text>
              </TouchableOpacity>
            </React.Fragment>
          )}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            { backgroundColor: colors.primary, opacity: isLoadingState ? 0.6 : 1 },
          ]}
          onPress={handleSubscribe}
          disabled={isLoadingState}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <React.Fragment>
              <IconSymbol
                ios_icon_name="lock.fill"
                android_material_icon_name="lock"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.subscribeButtonText}>
                Subscribe Now
              </Text>
            </React.Fragment>
          )}
        </TouchableOpacity>

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          activeOpacity={0.7}
          disabled={isLoadingState}
        >
          <Text style={[styles.restoreButtonText, { color: colors.primary, opacity: isLoadingState ? 0.6 : 1 }]}>
            Restore Purchases
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            • Cancel anytime from your Apple ID settings
          </Text>
          <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            • Secure payment through Apple
          </Text>
          <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            • Subscription auto-renews unless canceled
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, androidIcon, title, description, isDark }: any) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIcon, { backgroundColor: colors.primary + '15' }]}>
        <IconSymbol
          ios_icon_name={icon}
          android_material_icon_name={androidIcon}
          size={24}
          color={colors.primary}
        />
      </View>
      <View style={styles.featureContent}>
        <Text style={[styles.featureTitle, { color: isDark ? colors.textDark : colors.text }]}>
          {title}
        </Text>
        <Text style={[styles.featureDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.h1,
    fontSize: 32,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  featuresSection: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  pricingSection: {
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  planCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    position: 'relative',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: -12,
    right: spacing.lg,
  },
  saveBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  saveBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  planTitleContainer: {
    flex: 1,
  },
  planTitle: {
    ...typography.h3,
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  planPrice: {
    ...typography.h2,
    fontSize: 28,
  },
  planPeriod: {
    fontSize: 16,
    fontWeight: '400',
  },
  planDescription: {
    ...typography.body,
    fontSize: 14,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + spacing.xs,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  restoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    ...typography.caption,
    fontSize: 13,
    textAlign: 'center',
  },
});
