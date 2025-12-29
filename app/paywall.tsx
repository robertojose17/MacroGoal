
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
import { STRIPE_CONFIG } from '@/utils/stripeConfig';
import { logStripeConfig, logSubscriptionAttempt, validateStripeConfig } from '@/utils/stripeDebug';

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { createCheckoutSession, loading: subscriptionLoading } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [configValid, setConfigValid] = useState(true);
  const [configErrors, setConfigErrors] = useState<string[]>([]);

  useEffect(() => {
    // Log configuration on mount
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[Paywall] 🎬 Screen mounted');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const validation = logStripeConfig();
    setConfigValid(validation.ok);
    setConfigErrors(validation.errors);
  }, []);

  const handleSubscribe = async () => {
    try {
      setCheckoutLoading(true);

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('[Paywall] 🚀 Subscribe button pressed');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Validate configuration before attempting
      const validation = validateStripeConfig();
      if (!validation.ok) {
        console.error('[Paywall] ❌ Invalid Stripe configuration:', validation.errors);
        Alert.alert(
          'Configuration Error',
          'Stripe is not configured correctly. Please check the console for details.\n\n' +
          validation.errors.join('\n'),
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('[Paywall] ✅ Stripe configuration is valid');

      const priceId = selectedPlan === 'monthly' ? STRIPE_CONFIG.MONTHLY_PRICE_ID : STRIPE_CONFIG.YEARLY_PRICE_ID;

      if (!priceId) {
        console.error('[Paywall] ❌ Price ID is undefined for plan:', selectedPlan);
        Alert.alert(
          'Configuration Error',
          `Price ID for ${selectedPlan} plan is not configured. Please check your Stripe configuration.`,
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('[Paywall] 📋 Subscription details:');
      console.log('[Paywall]   - Plan:', selectedPlan);
      console.log('[Paywall]   - Price ID:', priceId);
      console.log('[Paywall]   - Price:', selectedPlan === 'monthly' ? `$${STRIPE_CONFIG.MONTHLY_PRICE}/month` : `$${STRIPE_CONFIG.YEARLY_PRICE}/year`);

      logSubscriptionAttempt(priceId, selectedPlan);

      console.log('[Paywall] 🔄 Calling createCheckoutSession...');
      await createCheckoutSession(priceId, selectedPlan);

      console.log('[Paywall] ✅ Checkout session created successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[Paywall] ❌ Error creating checkout session');
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('[Paywall] Error type:', error.constructor?.name || 'Unknown');
      console.error('[Paywall] Error message:', error.message);
      console.error('[Paywall] Error stack:', error.stack);
      console.error('[Paywall] Full error:', JSON.stringify(error, null, 2));
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      let errorMessage = 'Failed to start checkout. Please try again.';
      
      // Provide more specific error messages
      if (error.message?.includes('FunctionsFetchError')) {
        errorMessage = 'Unable to connect to the payment service. Please check your internet connection and try again.\n\n' +
          'If the problem persists, the payment service may be temporarily unavailable.';
      } else if (error.message?.includes('No such price')) {
        errorMessage = 'Invalid Price ID. Please check your Stripe configuration.\n\n' +
          'Make sure you are using PRICE IDs (starting with "price_") and not PRODUCT IDs (starting with "prod_").';
      } else if (error.message?.includes('Unauthorized') || error.message?.includes('Not authenticated')) {
        errorMessage = 'You must be logged in to subscribe. Please log in and try again.';
      } else if (error.message?.includes('No checkout URL')) {
        errorMessage = 'Failed to create checkout session. The payment service did not return a valid checkout URL.\n\n' +
          'Please try again or contact support if the problem persists.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(
        'Subscription Error',
        errorMessage,
        [{ text: 'OK' }]
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleRestore = () => {
    console.log('[Paywall] ℹ️ Restore subscription button pressed');
    Alert.alert(
      'Restore Subscription',
      'If you already have an active subscription, it will be automatically detected when you log in. Please make sure you are logged in with the same account you used to subscribe.',
      [{ text: 'OK' }]
    );
  };

  const isLoading = subscriptionLoading || checkoutLoading;

  // Show configuration error UI if config is invalid
  if (!configValid) {
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

        <View style={styles.errorContainer}>
          <View style={[styles.errorIconContainer, { backgroundColor: '#FF3B3020' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={48}
              color="#FF3B30"
            />
          </View>
          <Text style={[styles.errorTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Configuration Error
          </Text>
          <Text style={[styles.errorMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Stripe is not configured correctly. Please check the following issues:
          </Text>
          <View style={styles.errorList}>
            {configErrors.map((error, index) => (
              <Text key={index} style={[styles.errorItem, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                • {error}
              </Text>
            ))}
          </View>
          {__DEV__ && (
            <View style={[styles.devNote, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.devNoteText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                <Text style={{ fontWeight: '700' }}>Developer Note:</Text> Update the PRICE_IDS in utils/stripeConfig.ts with your Stripe price IDs.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

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
                  ${STRIPE_CONFIG.MONTHLY_PRICE}<Text style={styles.planPeriod}>/month</Text>
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
                <Text style={styles.saveBadgeText}>Save {STRIPE_CONFIG.YEARLY_SAVINGS_PERCENT}%</Text>
              </View>
            </View>
            <View style={styles.planHeader}>
              <View style={styles.planTitleContainer}>
                <Text style={[styles.planTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Yearly
                </Text>
                <Text style={[styles.planPrice, { color: colors.primary }]}>
                  ${STRIPE_CONFIG.YEARLY_PRICE}<Text style={styles.planPeriod}>/year</Text>
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
              Best value - just ${STRIPE_CONFIG.YEARLY_MONTHLY_EQUIVALENT}/month
            </Text>
          </TouchableOpacity>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            { backgroundColor: colors.primary, opacity: isLoading ? 0.6 : 1 },
          ]}
          onPress={handleSubscribe}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          {checkoutLoading ? (
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
        >
          <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
            Restore Subscription
          </Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            • Cancel anytime from your account settings
          </Text>
          <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            • Secure payment powered by Stripe
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  errorTitle: {
    ...typography.h1,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorMessage: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  errorList: {
    alignSelf: 'stretch',
    marginBottom: spacing.xl,
  },
  errorItem: {
    ...typography.body,
    fontSize: 14,
    marginBottom: spacing.xs,
    paddingLeft: spacing.md,
  },
  devNote: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  devNoteText: {
    ...typography.caption,
    fontSize: 13,
    textAlign: 'center',
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
