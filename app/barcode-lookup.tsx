
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

// CRITICAL: Timeout constant
const LOOKUP_TIMEOUT_MS = 10000; // 10 seconds

/**
 * BARCODE LOOKUP HANDLER SCREEN
 * 
 * This screen is ONLY shown when:
 * 1. Product not found (status=0)
 * 2. Lookup error/timeout
 * 
 * When product is found, scanner navigates DIRECTLY to food-details
 */
export default function BarcodeLookupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const barcode = (params.barcode as string) || '';
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const mode = (params.mode as string) || 'diary';
  const myMealId = (params.mealId as string) || undefined;
  const errorParam = (params.error as string) || undefined;

  const [loading, setLoading] = useState(!errorParam); // Only load if no error param
  const [error, setError] = useState<string | null>(errorParam || null);
  const [notFound, setNotFound] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    console.log('[BarcodeLookup] ========== COMPONENT MOUNTED ==========');
    console.log('[BarcodeLookup] Barcode:', barcode);
    console.log('[BarcodeLookup] Meal:', mealType);
    console.log('[BarcodeLookup] Date:', date);
    console.log('[BarcodeLookup] Mode:', mode);
    console.log('[BarcodeLookup] Error param:', errorParam);

    if (!barcode || barcode.length === 0) {
      console.error('[BarcodeLookup] ❌ No barcode provided');
      Alert.alert('Error', 'No barcode provided', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
      return;
    }

    // If error param is provided, show error immediately
    if (errorParam) {
      console.log('[BarcodeLookup] Error param provided, showing error UI');
      setError(errorParam);
      setLoading(false);
      return;
    }

    // Otherwise, start lookup
    performLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const performLookup = async () => {
    console.log('[BarcodeLookup] ========== START LOOKUP ==========');
    console.log('[BarcodeLookup] BARCODE:', barcode);
    console.log('[BarcodeLookup] Barcode length:', barcode.length);
    console.log('[BarcodeLookup] Barcode type:', typeof barcode);
    
    setLoading(true);
    setError(null);
    setNotFound(false);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        console.log('[BarcodeLookup] ⏱️ LOOKUP TIMEOUT REACHED');
        reject(new Error('Lookup timeout'));
      }, LOOKUP_TIMEOUT_MS);
    });

    try {
      // Using v2 endpoint as per OpenFoodFacts API documentation
      const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
      console.log('[BarcodeLookup] LOOKUP URL:', url);
      console.log('[BarcodeLookup] Starting fetch...');

      const fetchPromise = fetch(url, {
        headers: {
          'User-Agent': 'EliteMacroTracker/1.0 (iOS)',
          'Accept': 'application/json',
        },
      });

      console.log('[BarcodeLookup] Waiting for response (max 10s)...');
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log('[BarcodeLookup] ⚠️ Component unmounted during lookup');
        return;
      }

      console.log('[BarcodeLookup] HTTP STATUS:', response.status);

      if (!response.ok) {
        console.log('[BarcodeLookup] ❌ HTTP error:', response.status);
        throw new Error(`HTTP error: ${response.status}`);
      }

      console.log('[BarcodeLookup] Parsing JSON response...');
      const result = await response.json();

      // Check if component is still mounted after async operation
      if (!isMountedRef.current) {
        console.log('[BarcodeLookup] ⚠️ Component unmounted after API call');
        return;
      }

      const status = Number(result.status);
      console.log('[BarcodeLookup] OFF JSON status:', status, '(1=found, 0=not found)');
      console.log('[BarcodeLookup] Has product:', !!result.product);

      if (result.product) {
        console.log('[BarcodeLookup] Product name:', result.product.product_name || 'Unknown');
        console.log('[BarcodeLookup] Product brand:', result.product.brands || 'Unknown');
        console.log('[BarcodeLookup] Product code:', result.product.code || 'N/A');
      }

      if (status === 1 && result.product) {
        console.log('[BarcodeLookup] ✅ PRODUCT FOUND');
        console.log('[BarcodeLookup] Product name:', result.product.product_name || 'Unknown');

        // Navigate to food-details with product data
        console.log('[BarcodeLookup] NAVIGATING TO: food-details');
        
        router.replace({
          pathname: '/food-details',
          params: {
            offData: JSON.stringify(result.product),
            meal: mealType,
            date: date,
            mode: mode,
            returnTo: '/(tabs)/(home)/',
            mealId: myMealId || '',
          },
        });
      } else {
        // Product not found
        console.log('[BarcodeLookup] ❌ PRODUCT NOT FOUND');
        console.log('[BarcodeLookup] Barcode:', barcode);
        setNotFound(true);
        setLoading(false);
      }
    } catch (error: any) {
      console.error('[BarcodeLookup] ❌ LOOKUP ERROR:', error);
      console.error('[BarcodeLookup] Error message:', error.message);
      console.error('[BarcodeLookup] Error stack:', error.stack);

      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log('[BarcodeLookup] ⚠️ Component unmounted during error handling');
        return;
      }

      // Set error state
      setLoading(false);
      
      if (error.message === 'Lookup timeout') {
        console.log('[BarcodeLookup] Error type: TIMEOUT');
        setError('Lookup timed out. The product database might be slow or unavailable.');
      } else {
        console.log('[BarcodeLookup] Error type: UNKNOWN');
        setError('Failed to look up product. Please check your internet connection and try again.');
      }
    }
  };

  const handleRetry = () => {
    console.log('[BarcodeLookup] Retry button pressed');
    performLookup();
  };

  const handleManualSearch = () => {
    console.log('[BarcodeLookup] Manual search button pressed');
    router.replace({
      pathname: '/food-search',
      params: {
        meal: mealType,
        date: date,
        mode: mode,
        mealId: myMealId || '',
      },
    });
  };

  const handleRescan = () => {
    console.log('[BarcodeLookup] Rescan button pressed');
    router.back();
  };

  const handleQuickAdd = () => {
    console.log('[BarcodeLookup] Quick add button pressed');
    router.replace({
      pathname: '/quick-add',
      params: {
        meal: mealType,
        date: date,
        mode: mode,
        mealId: myMealId || '',
        barcode: barcode,
      },
    });
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Looking Up Product
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Looking up product...
          </Text>
          <Text style={[styles.loadingSubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Barcode: {barcode}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Lookup Failed
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.errorContainer}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle"
            android_material_icon_name="warning"
            size={64}
            color={colors.warning || '#FF9500'}
          />
          <Text style={[styles.errorTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Connection Issue
          </Text>
          <Text style={[styles.errorText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {error}
          </Text>
          <Text style={[styles.barcodeText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Barcode: {barcode}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleRetry}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleManualSearch}
          >
            <Text style={[styles.secondaryButtonText, { color: isDark ? colors.textDark : colors.text }]}>
              Search Manually
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Not found state
  if (notFound) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Product Not Found
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.notFoundContainer}>
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search_off"
            size={64}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <Text style={[styles.notFoundTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Product Not Found
          </Text>
          <Text style={[styles.notFoundText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            This barcode is not in the OpenFoodFacts database yet.
          </Text>
          <Text style={[styles.barcodeText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Barcode: {barcode}
          </Text>
          
          <View style={styles.optionsContainer}>
            <Text style={[styles.optionsTitle, { color: isDark ? colors.textDark : colors.text }]}>
              What would you like to do?
            </Text>
            
            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={handleManualSearch}
            >
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={24}
                color={colors.primary}
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Search Manually
                </Text>
                <Text style={[styles.optionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Search by food name
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={handleQuickAdd}
            >
              <IconSymbol
                ios_icon_name="pencil"
                android_material_icon_name="edit"
                size={24}
                color={colors.primary}
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Add Manually
                </Text>
                <Text style={[styles.optionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Enter calories & macros
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={handleRescan}
            >
              <IconSymbol
                ios_icon_name="barcode.viewfinder"
                android_material_icon_name="qr_code_scanner"
                size={24}
                color={colors.primary}
              />
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  Scan Again
                </Text>
                <Text style={[styles.optionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Try scanning another barcode
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Should never reach here
  return null;
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
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    ...typography.h2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  barcodeText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.xl,
    fontFamily: 'monospace',
  },
  primaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  notFoundTitle: {
    ...typography.h2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  notFoundText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  optionsContainer: {
    width: '100%',
    marginTop: spacing.xl,
  },
  optionsTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
    gap: spacing.md,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
  },
  optionSubtitle: {
    ...typography.caption,
    fontSize: 13,
  },
});
