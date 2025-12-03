
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

// Toggle between API versions
const USE_API_V2 = false; // Set to true to use v2 API

/**
 * Score a product based on the number of non-zero nutriments
 * This is the EXACT scoring function requested by the user
 */
function scoreProduct(p: any): number {
  if (!p || !p.nutriments) return 0;
  const n = p.nutriments;
  const values = [
    n['energy-kcal_100g'] ?? n['energy-kcal_serving'],
    n['proteins_100g'] ?? n['proteins_serving'],
    n['carbohydrates_100g'] ?? n['carbohydrates_serving'],
    n['fat_100g'] ?? n['fat_serving'],
    n['fiber_100g'] ?? n['fiber_serving'],
  ];
  return values.filter(v => typeof v === 'number' && v > 0).length;
}

/**
 * Select the best product from multiple candidates based on nutrient completeness
 * Returns the product with the most non-zero nutrient values
 * Uses the EXACT logic requested by the user
 */
function selectBestProduct(products: any): any {
  console.log('[BarcodeScanner] ========== SELECTING BEST PRODUCT ==========');
  
  // Convert to array if needed
  const candidates = Array.isArray(products) ? products : [products].filter(Boolean);
  
  console.log('[BarcodeScanner] Number of candidates:', candidates.length);
  
  if (candidates.length === 0) {
    console.log('[BarcodeScanner] No candidates available');
    return null;
  }
  
  // Sort by score (highest first)
  const sorted = candidates
    .filter(p => !!p)
    .sort((a, b) => scoreProduct(b) - scoreProduct(a));
  
  // Log scores for debugging
  sorted.forEach((p, index) => {
    const score = scoreProduct(p);
    console.log(`[BarcodeScanner] Candidate ${index + 1}: score=${score}, name="${p.product_name || 'Unknown'}"`);
  });
  
  // Select best product
  const bestProduct = sorted[0] ?? candidates[0] ?? null;
  
  if (bestProduct) {
    console.log('[BarcodeScanner] ✅ Best product selected:', bestProduct.product_name || 'Unknown');
    console.log('[BarcodeScanner] Best product score:', scoreProduct(bestProduct));
  } else {
    console.log('[BarcodeScanner] ❌ No valid product found');
  }
  
  return bestProduct;
}

export default function BarcodeScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mode = (params.mode as string) || 'diary';
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const myMealId = (params.mealId as string) || undefined;

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // CRITICAL FIX: Use a ref to track if navigation has already been triggered
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    console.log('[BarcodeScanner] ========== COMPONENT MOUNTED ==========');
    console.log('[BarcodeScanner] Params:', { mode, mealType, date, myMealId });
  }, []);

  // Reset state when screen gains focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('[BarcodeScanner] Screen focused → reset scan state');
      setScanned(false);
      setLoading(false);
      hasNavigatedRef.current = false; // CRITICAL: Reset navigation flag

      return () => {
        console.log('[BarcodeScanner] Screen unfocused');
      };
    }, [])
  );

  // Handle permission request
  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      console.log('[BarcodeScanner] Camera permission denied permanently');
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to scan barcodes.',
        [
          {
            text: 'Go Back',
            onPress: () => router.back(),
          },
        ]
      );
    }
  }, [permission]);

  /**
   * SINGLE NAVIGATION FUNCTION
   * This is the ONLY place where navigation to food-details happens
   * Prevents duplicate navigation by checking hasNavigatedRef
   */
  const navigateToFoodDetails = (product: any) => {
    // CRITICAL: Check if we've already navigated
    if (hasNavigatedRef.current) {
      console.log('[BarcodeScanner] ⚠️ Navigation already triggered, ignoring duplicate call');
      return;
    }

    console.log('[BarcodeScanner] ========== NAVIGATING TO FOOD DETAILS ==========');
    console.log('[BarcodeScanner] Product:', product.product_name || 'Unknown');
    console.log('[BarcodeScanner] This is the ONLY navigation call');

    // CRITICAL: Mark that we've navigated
    hasNavigatedRef.current = true;

    // CRITICAL: Set loading to false BEFORE navigation
    setLoading(false);

    // Dismiss all screens back to home
    router.dismissTo('/(tabs)/(home)/');

    // Navigate to food details
    // Use a small delay to ensure dismissTo completes
    setTimeout(() => {
      console.log('[BarcodeScanner] Pushing Food Details screen');
      router.push({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(product),
          meal: mealType,
          date: date,
          mode: mode,
          returnTo: '/(tabs)/(home)/',
          mealId: myMealId,
        },
      });
      console.log('[BarcodeScanner] ✅ Navigation completed - EXACTLY ONE Food Details screen');
    }, 100);
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    // CRITICAL: Only process if not already scanned and not loading
    if (scanned || loading) {
      console.log('[BarcodeScanner] Already processing a scan, ignoring');
      return;
    }

    // CRITICAL: Check if we've already navigated (extra safety)
    if (hasNavigatedRef.current) {
      console.log('[BarcodeScanner] Already navigated, ignoring scan');
      return;
    }

    console.log('[BarcodeScanner] ========== BARCODE SCANNED ==========');
    console.log('[SCAN] type:', type);
    console.log('[SCAN] raw data:', JSON.stringify(data));

    // Clean the barcode
    const cleanBarcode = data.trim();
    console.log('[SCAN] cleanBarcode:', cleanBarcode);

    // Validate barcode
    if (!cleanBarcode || cleanBarcode.length === 0) {
      console.log('[BarcodeScanner] ❌ Empty barcode after cleaning');
      Alert.alert(
        'Invalid Barcode',
        'The scanned barcode appears to be empty. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => {
              setScanned(false);
              setLoading(false);
            },
          },
        ]
      );
      return;
    }

    // SPECIAL TEST: Log if this is the test barcode
    if (cleanBarcode === '5059883177496') {
      console.log('[BarcodeScanner] ⭐ TEST BARCODE DETECTED: 5059883177496');
    }

    // CRITICAL: Set states immediately to prevent re-scanning
    setLoading(true);
    setScanned(true);

    try {
      // Construct URL based on API version
      const url = USE_API_V2
        ? `https://world.openfoodfacts.net/api/v2/product/${cleanBarcode}`
        : `https://world.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`;

      console.log('[BarcodeScanner] API version:', USE_API_V2 ? 'v2' : 'v0');
      console.log('[BarcodeScanner] Calling OpenFoodFacts API...');
      console.log('[BarcodeScanner] URL:', url);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EliteMacroTracker/1.0 (iOS)',
          'Accept': 'application/json',
        },
      });

      console.log('[BarcodeScanner] Response status:', response.status);

      if (!response.ok) {
        console.error('[BarcodeScanner] HTTP error:', response.status);
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();
      
      // SPECIAL TEST: Log full result for test barcode
      if (cleanBarcode === '5059883177496') {
        console.log('[BarcodeScanner] Test 5059883177496 result:', JSON.stringify(result).slice(0, 500));
        console.log('[BarcodeScanner] Full nutriments:', JSON.stringify(result.product?.nutriments || {}));
      } else {
        console.log('[BarcodeScanner] Full result:', JSON.stringify(result).slice(0, 500));
      }

      // Force status to number
      const status = Number(result.status);
      console.log('[BarcodeScanner] Status (as number):', status);
      console.log('[BarcodeScanner] Has product:', !!result.product);

      // Check if product exists and has basic info
      if (status === 1 && result.product) {
        console.log('[BarcodeScanner] ✅ PRODUCT FOUND');
        console.log('[BarcodeScanner] Product name:', result.product.product_name || 'Unknown');
        console.log('[BarcodeScanner] Brand:', result.product.brands || 'Unknown');
        console.log('[BarcodeScanner] Barcode:', result.product.code || cleanBarcode);

        // Log nutriments availability with multiple possible field names
        const nutriments = result.product.nutriments || {};
        console.log('[BarcodeScanner] Nutriments keys:', Object.keys(nutriments));
        console.log('[BarcodeScanner] Nutriments available:', {
          'energy-kcal_100g': nutriments['energy-kcal_100g'],
          'energy-kcal': nutriments['energy-kcal'],
          'energy_100g': nutriments['energy_100g'],
          'energy': nutriments['energy'],
          'proteins_100g': nutriments['proteins_100g'],
          'proteins': nutriments['proteins'],
          'carbohydrates_100g': nutriments['carbohydrates_100g'],
          'carbohydrates': nutriments['carbohydrates'],
          'fat_100g': nutriments['fat_100g'],
          'fat': nutriments['fat'],
          'fiber_100g': nutriments['fiber_100g'],
          'fiber': nutriments['fiber'],
        });

        // Check if we have at least some nutrition data
        const hasNutrition = 
          nutriments['energy-kcal_100g'] !== undefined ||
          nutriments['energy-kcal'] !== undefined ||
          nutriments['energy_100g'] !== undefined ||
          nutriments['proteins_100g'] !== undefined ||
          nutriments['proteins'] !== undefined ||
          nutriments['carbohydrates_100g'] !== undefined ||
          nutriments['carbohydrates'] !== undefined ||
          nutriments['fat_100g'] !== undefined ||
          nutriments['fat'] !== undefined;

        if (!hasNutrition) {
          console.log('[BarcodeScanner] ⚠️ Product found but NO nutrition data available');
        } else {
          console.log('[BarcodeScanner] ✅ Product has nutrition data');
        }

        // CRITICAL FIX: Select best product using the exact scoring function
        // This ensures only ONE product is chosen, even if the API returns multiple
        const bestProduct = selectBestProduct(result.product);

        if (!bestProduct) {
          console.log('[BarcodeScanner] ❌ No valid product after selection');
          throw new Error('No valid product found');
        }

        // CRITICAL FIX: Call the SINGLE navigation function
        // This is the ONLY place where navigation happens
        console.log('[BarcodeScanner] ⚠️ Calling navigateToFoodDetails (ONLY ONCE)');
        navigateToFoodDetails(bestProduct);

      } else {
        // Product not found
        console.log('[BarcodeScanner] ❌ PRODUCT NOT FOUND');
        console.log('[BarcodeScanner] Status code:', status);
        console.log('[BarcodeScanner] Result keys:', Object.keys(result));
        
        // CRITICAL: Reset states before showing alert
        setLoading(false);
        setScanned(false);
        
        // Show "not found" dialog with options
        Alert.alert(
          'Product Not Found',
          `This barcode (${cleanBarcode}) was not found in OpenFoodFacts.`,
          [
            {
              text: 'Scan Again',
              onPress: () => {
                console.log('[BarcodeScanner] User chose to scan again');
                setScanned(false);
                setLoading(false);
              },
            },
            {
              text: 'Add Manually',
              onPress: () => {
                console.log('[BarcodeScanner] User chose to add manually');
                setScanned(false);
                setLoading(false);
                
                // Dismiss scanner and Add Food, then push quick-add
                router.dismissTo('/(tabs)/(home)/');
                setTimeout(() => {
                  router.push({
                    pathname: '/quick-add',
                    params: {
                      meal: mealType,
                      date: date,
                      mode: mode,
                      mealId: myMealId,
                      barcode: cleanBarcode,
                    },
                  });
                }, 100);
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                console.log('[BarcodeScanner] User cancelled');
                setScanned(false);
                setLoading(false);
                router.back();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('[BarcodeScanner] ❌ ERROR FETCHING PRODUCT');
      console.error('[BarcodeScanner] Error details:', error);
      
      // CRITICAL: Reset states before showing alert
      setLoading(false);
      setScanned(false);
      
      // Show error dialog with retry option
      Alert.alert(
        'Error',
        'There was a problem looking up this barcode. Please try again or add the food manually.',
        [
          {
            text: 'Try Again',
            onPress: () => {
              console.log('[BarcodeScanner] User chose to retry');
              setScanned(false);
              setLoading(false);
            },
          },
          {
            text: 'Add Manually',
            onPress: () => {
              console.log('[BarcodeScanner] User chose to add manually after error');
              setScanned(false);
              setLoading(false);
              
              // Dismiss scanner and Add Food, then push quick-add
              router.dismissTo('/(tabs)/(home)/');
              setTimeout(() => {
                router.push({
                  pathname: '/quick-add',
                  params: {
                    meal: mealType,
                    date: date,
                    mode: mode,
                    mealId: myMealId,
                  },
                });
              }, 100);
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              console.log('[BarcodeScanner] User cancelled after error');
              setScanned(false);
              setLoading(false);
              router.back();
            },
          },
        ]
      );
    }
  };

  // Show loading while checking permissions
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Checking camera permissions...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show permission request screen
  if (!permission.granted) {
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
            Barcode Scanner
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.permissionContainer}>
          <IconSymbol
            ios_icon_name="camera"
            android_material_icon_name="camera_alt"
            size={64}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <Text style={[styles.permissionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Camera Access Required
          </Text>
          <Text style={[styles.permissionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            We need access to your camera to scan barcodes and find food products.
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: isDark ? colors.textDark : colors.text }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show camera view
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000000' }]} edges={['top']}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
          }}
          onBarcodeScanned={loading || scanned ? undefined : handleBarCodeScanned}
        />

        {/* Overlay with scanning frame */}
        <View style={styles.overlay}>
          {/* Top overlay */}
          <View style={styles.overlayTop}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log('[BarcodeScanner] Close button pressed');
                setScanned(false);
                setLoading(false);
                hasNavigatedRef.current = false;
                router.back();
              }}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={28}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>

          {/* Middle with scanning frame */}
          <View style={styles.overlayMiddle}>
            <View style={styles.overlayLeft} />
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTopLeft]} />
              <View style={[styles.corner, styles.cornerTopRight]} />
              <View style={[styles.corner, styles.cornerBottomLeft]} />
              <View style={[styles.corner, styles.cornerBottomRight]} />
            </View>
            <View style={styles.overlayRight} />
          </View>

          {/* Bottom overlay with instructions */}
          <View style={styles.overlayBottom}>
            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.loadingOverlayText}>Looking up product...</Text>
              </View>
            ) : (
              <View style={styles.instructionsContainer}>
                <Text style={styles.instructionsText}>
                  Align the barcode within the frame
                </Text>
                <Text style={styles.instructionsSubtext}>
                  The barcode will be scanned automatically
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
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
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  permissionTitle: {
    ...typography.h2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  permissionButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.md,
    paddingHorizontal: spacing.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: 250,
  },
  overlayLeft: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanFrame: {
    width: 280,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#FFFFFF',
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: borderRadius.lg,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: borderRadius.lg,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: borderRadius.lg,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: borderRadius.lg,
  },
  overlayRight: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  instructionsContainer: {
    alignItems: 'center',
  },
  instructionsText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  instructionsSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingOverlay: {
    alignItems: 'center',
  },
  loadingOverlayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.md,
  },
});
