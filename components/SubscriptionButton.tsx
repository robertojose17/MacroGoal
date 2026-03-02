
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useSubscription } from '@/hooks/useSubscription';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';

interface SubscriptionButtonProps {
  onSubscribed?: () => void;
}

export default function SubscriptionButton({ onSubscribed }: SubscriptionButtonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [showModal, setShowModal] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const { products, purchaseProduct, restorePurchases, isSubscribed, loading, error, storeConnected, diagnostics } = useSubscription();

  const handlePurchase = async (productId: string) => {
    await purchaseProduct(productId);
    if (onSubscribed) {
      onSubscribed();
    }
  };

  const handleRestore = async () => {
    await restorePurchases();
  };

  const getProductDisplayName = (productId: string) => {
    if (productId.includes('monthly')) return 'Monthly';
    if (productId.includes('yearly')) return 'Annual';
    return 'Premium';
  };

  const getProductPeriod = (productId: string) => {
    if (productId.includes('monthly')) return '/month';
    if (productId.includes('yearly')) return '/year';
    return '';
  };

  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.notAvailableContainer, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle"
          android_material_icon_name="warning"
          size={32}
          color={colors.textSecondary}
        />
        <Text style={[styles.notAvailableText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          In-App Purchases are only available on iOS
        </Text>
      </View>
    );
  }

  if (isSubscribed) {
    return (
      <View style={[styles.subscribedContainer, { backgroundColor: colors.success + '20' }]}>
        <IconSymbol
          ios_icon_name="checkmark.circle.fill"
          android_material_icon_name="check-circle"
          size={32}
          color={colors.success}
        />
        <Text style={[styles.subscribedText, { color: colors.success }]}>
          Premium Active
        </Text>
      </View>
    );
  }

  const canPurchase = storeConnected && products.length > 0 && !loading;
  const canRestore = storeConnected && !loading;

  return (
    <>
      <TouchableOpacity
        style={[styles.upgradeButton, { backgroundColor: colors.primary }]}
        onPress={() => setShowModal(true)}
      >
        <IconSymbol
          ios_icon_name="star.fill"
          android_material_icon_name="star"
          size={20}
          color="#FFFFFF"
        />
        <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeButton}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={isDark ? colors.textDark : colors.text}
                />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.titleSection}>
                <IconSymbol
                  ios_icon_name="star.fill"
                  android_material_icon_name="star"
                  size={48}
                  color={colors.primary}
                />
                <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Unlock Premium Features
                </Text>
                <Text style={[styles.modalSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Get the most out of Macro Goal
                </Text>
              </View>

              <View style={styles.featuresSection}>
                <FeatureItem
                  icon="trending-up"
                  title="Advanced Analytics"
                  description="7/30-day charts, trends, and adherence tracking"
                  isDark={isDark}
                />
                <FeatureItem
                  icon="restaurant"
                  title="Custom Recipes"
                  description="Multi-ingredient recipe builder"
                  isDark={isDark}
                />
                <FeatureItem
                  icon="flag"
                  title="Multiple Goal Phases"
                  description="Switch between cut, maintain, and bulk"
                  isDark={isDark}
                />
                <FeatureItem
                  icon="check-circle"
                  title="Habit Tracking"
                  description="Track streaks and completion rates"
                  isDark={isDark}
                />
                <FeatureItem
                  icon="download"
                  title="Data Export"
                  description="Export your data as CSV"
                  isDark={isDark}
                />
                <FeatureItem
                  icon="lightbulb"
                  title="Smart Suggestions"
                  description="AI-powered tips and recommendations"
                  isDark={isDark}
                />
              </View>

              {error && (
                <View style={styles.errorContainer}>
                  <IconSymbol
                    ios_icon_name="exclamationmark.triangle"
                    android_material_icon_name="warning"
                    size={32}
                    color={colors.error}
                  />
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    {error}
                  </Text>
                  <Text style={[styles.errorHint, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Make sure you&apos;re testing on a real device or TestFlight
                  </Text>
                  
                  {diagnostics.length > 0 && (
                    <TouchableOpacity 
                      style={styles.diagnosticsButton}
                      onPress={() => setShowDiagnostics(!showDiagnostics)}
                    >
                      <Text style={[styles.diagnosticsButtonText, { color: colors.primary }]}>
                        {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {showDiagnostics && diagnostics.length > 0 && (
                <View style={[styles.diagnosticsContainer, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                  <Text style={[styles.diagnosticsTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    Connection Diagnostics
                  </Text>
                  <ScrollView style={styles.diagnosticsScroll} nestedScrollEnabled>
                    {diagnostics.map((diag, index) => (
                      <Text 
                        key={index} 
                        style={[styles.diagnosticLine, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}
                      >
                        {diag}
                      </Text>
                    ))}
                  </ScrollView>
                </View>
              )}

              {loading && products.length === 0 && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Connecting to App Store...
                  </Text>
                </View>
              )}

              {!loading && products.length > 0 && (
                <View style={styles.pricingSection}>
                  {products.map((product) => (
                    <TouchableOpacity
                      key={product.productId}
                      style={[
                        styles.priceCard,
                        { backgroundColor: isDark ? colors.cardDark : colors.card },
                        !canPurchase && styles.priceCardDisabled,
                      ]}
                      onPress={() => handlePurchase(product.productId)}
                      disabled={!canPurchase}
                    >
                      <View style={styles.priceCardHeader}>
                        <Text style={[styles.priceCardTitle, { color: isDark ? colors.textDark : colors.text }]}>
                          {getProductDisplayName(product.productId)}
                        </Text>
                        {product.productId.includes('yearly') && (
                          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.badgeText}>Best Value</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.priceRow}>
                        <Text style={[styles.priceAmount, { color: colors.primary }]}>
                          {product.price}
                        </Text>
                        <Text style={[styles.pricePeriod, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                          {getProductPeriod(product.productId)}
                        </Text>
                      </View>
                      <Text style={[styles.priceDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {product.description}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {!loading && !error && products.length === 0 && (
                <View style={styles.noProductsContainer}>
                  <Text style={[styles.noProductsText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    No subscription options available at the moment
                  </Text>
                  {diagnostics.length > 0 && (
                    <TouchableOpacity 
                      style={styles.diagnosticsButton}
                      onPress={() => setShowDiagnostics(!showDiagnostics)}
                    >
                      <Text style={[styles.diagnosticsButtonText, { color: colors.primary }]}>
                        {showDiagnostics ? 'Hide' : 'Show'} Diagnostics
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity
                style={[styles.restoreButton, !canRestore && styles.restoreButtonDisabled]}
                onPress={handleRestore}
                disabled={!canRestore}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.restoreButtonText, { color: canRestore ? colors.primary : colors.textSecondary }]}>
                    Restore Purchases
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={[styles.footerText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Subscriptions auto-renew unless canceled 24 hours before the end of the current period.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function FeatureItem({ icon, title, description, isDark }: { icon: string; title: string; description: string; isDark: boolean }) {
  return (
    <View style={styles.featureItem}>
      <View style={[styles.featureIconContainer, { backgroundColor: colors.primary + '20' }]}>
        <IconSymbol
          ios_icon_name={icon}
          android_material_icon_name={icon}
          size={20}
          color={colors.primary}
        />
      </View>
      <View style={styles.featureTextContainer}>
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
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  subscribedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  subscribedText: {
    fontSize: 16,
    fontWeight: '600',
  },
  notAvailableContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  notAvailableText: {
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    ...typography.h2,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...typography.body,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  featuresSection: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  featureDescription: {
    ...typography.caption,
  },
  pricingSection: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  priceCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary + '40',
  },
  priceCardDisabled: {
    opacity: 0.5,
  },
  priceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  priceCardTitle: {
    ...typography.h3,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: '700',
  },
  pricePeriod: {
    fontSize: 16,
    marginLeft: spacing.xs,
  },
  priceDescription: {
    ...typography.caption,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodyBold,
    textAlign: 'center',
  },
  errorHint: {
    ...typography.caption,
    textAlign: 'center',
  },
  diagnosticsButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  diagnosticsButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  diagnosticsContainer: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    maxHeight: 200,
  },
  diagnosticsTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  diagnosticsScroll: {
    maxHeight: 150,
  },
  diagnosticLine: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: spacing.xs,
  },
  noProductsContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  noProductsText: {
    ...typography.body,
    textAlign: 'center',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  restoreButtonDisabled: {
    opacity: 0.5,
  },
  restoreButtonText: {
    ...typography.bodyBold,
  },
  footerText: {
    ...typography.caption,
    textAlign: 'center',
    fontSize: 11,
  },
});
