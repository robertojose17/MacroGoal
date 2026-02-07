
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';

/**
 * BARCODE SCANNER SCREEN
 * 
 * MyFitnessPal-style flow:
 * 1. Open camera
 * 2. Scan barcode ONCE
 * 3. Immediately close camera
 * 4. Navigate DIRECTLY to Food Details (dismissing ALL previous screens including Add Food Menu)
 * 
 * CRITICAL FIX: Use router.dismissTo() to dismiss ALL screens back to home, then push food-details
 */
export default function BarcodeScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mode = (params.mode as string) || 'diary';
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const returnTo = (params.returnTo as string) || undefined;
  const myMealId = (params.mealId as string) || undefined;

  const [permission, requestPermission] = useCameraPermissions();
  
  // One-scan lock using ref (doesn't cause re-renders)
  const hasScannedRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    console.log('[BarcodeScanner] ========== COMPONENT MOUNTED ==========');
    console.log('[BarcodeScanner] Params:', { mode, context, mealType, date, returnTo, myMealId });
    isMountedRef.current = true;

    return () => {
      console.log('[BarcodeScanner] ========== COMPONENT UNMOUNTED ==========');
      isMountedRef.current = false;
    };
  }, [mode, context, mealType, date, returnTo, myMealId]);

  // Reset state when screen gains focus
  useFocusEffect(
    useCallback(() => {
      console.log('[BarcodeScanner] Screen focused → reset scan state');
      hasScannedRef.current = false;

      return () => {
        console.log('[BarcodeScanner] Screen unfocused');
      };
    }, [])
  );

  /**
   * Perform OpenFoodFacts lookup and navigate to Food Details
   * CRITICAL FIX: Use router.dismissTo() to dismiss ALL screens back to home, then push food-details
   */
  const performLookupAndNavigate = useCallback(async (barcode: string) => {
    console.log('[BarcodeScanner] ========== PERFORMING LOOKUP ==========');
    console.log('[BarcodeScanner] Barcode:', barcode);

    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`;
      console.log('[BarcodeScanner] Lookup URL:', url);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EliteMacroTracker/1.0',
          'Accept': 'application/json',
        },
      });

      console.log('[BarcodeScanner] HTTP Status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();
      const status = Number(result.status);
      
      console.log('[BarcodeScanner] OpenFoodFacts status:', status);

      if (status === 1 && result.product) {
        console.log('[BarcodeScanner] ✅ PRODUCT FOUND:', result.product.product_name);
        
        // CRITICAL FIX: Dismiss ALL screens back to home, then push food-details
        // This ensures Add Food Menu is completely removed from the stack
        console.log('[BarcodeScanner] 🚀 DISMISSING ALL SCREENS BACK TO HOME');
        
        // First, dismiss back to home
        router.dismissTo('/(tabs)/(home)/');
        
        // Then, after a brief moment, push food-details
        // This ensures the dismiss completes before the push
        setTimeout(() => {
          console.log('[BarcodeScanner] 🚀 PUSHING FOOD DETAILS');
          console.log('[BarcodeScanner] Context:', context);
          console.log('[BarcodeScanner] ReturnTo:', returnTo);
          router.push({
            pathname: '/food-details',
            params: {
              offData: JSON.stringify(result.product),
              meal: mealType,
              date: date,
              mode: mode,
              context: context,
              returnTo: returnTo || '/(tabs)/(home)/',
              mealId: myMealId || '',
            },
          });
        }, 100);
      } else {
        console.log('[BarcodeScanner] ❌ PRODUCT NOT FOUND');
        
        // Navigate to barcode-lookup screen to show "Not Found" UI
        // Also dismiss back to home first
        router.dismissTo('/(tabs)/(home)/');
        
        setTimeout(() => {
          router.push({
            pathname: '/barcode-lookup',
            params: {
              barcode: barcode,
              meal: mealType,
              date: date,
              mode: mode,
              context: context,
              returnTo: returnTo,
              mealId: myMealId || '',
            },
          });
        }, 100);
      }
    } catch (error: any) {
      console.error('[BarcodeScanner] ❌ LOOKUP ERROR:', error);
      
      // Navigate to barcode-lookup screen to show error UI
      // Also dismiss back to home first
      router.dismissTo('/(tabs)/(home)/');
      
      setTimeout(() => {
        router.push({
          pathname: '/barcode-lookup',
          params: {
            barcode: barcode,
            meal: mealType,
            date: date,
            mode: mode,
            context: context,
            returnTo: returnTo,
            mealId: myMealId || '',
            error: error.message || 'Lookup failed',
          },
        });
      }, 100);
    }
  }, [router, mealType, date, mode, context, returnTo, myMealId]);

  /**
   * Handle barcode scan
   * CRITICAL FIX: Use dismissTo() to remove ALL screens including Add Food Menu
   */
  const handleBarCodeScanned = useCallback(async ({ type, data }: { type: string; data: string }) => {
    // Check one-scan lock
    if (hasScannedRef.current) {
      console.log('[BarcodeScanner] ⚠️ Already scanned, ignoring duplicate scan');
      return;
    }

    // Check if component is still mounted
    if (!isMountedRef.current) {
      console.log('[BarcodeScanner] ⚠️ Component unmounted, ignoring scan');
      return;
    }

    console.log('[BarcodeScanner] ========== BARCODE SCANNED ==========');
    console.log('[BarcodeScanner] SCANNED BARCODE:', data);
    console.log('[BarcodeScanner] Type:', type);

    // Clean the barcode
    const cleanBarcode = data.trim();
    
    // Validate barcode
    if (!cleanBarcode || cleanBarcode.length === 0) {
      console.log('[BarcodeScanner] ❌ Empty barcode, ignoring');
      return;
    }

    // Set one-scan lock IMMEDIATELY
    hasScannedRef.current = true;
    console.log('[BarcodeScanner] ✅ One-scan lock activated');

    // Start lookup process immediately (no delay needed)
    console.log('[BarcodeScanner] 🚀 STARTING LOOKUP PROCESS');
    performLookupAndNavigate(cleanBarcode);
  }, [performLookupAndNavigate]);

  // Show loading while checking permissions
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
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
            We need camera access to use this function
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: isDark ? colors.textDark : colors.text }]}>
              Close
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
          onBarcodeScanned={hasScannedRef.current ? undefined : handleBarCodeScanned}
        />

        {/* Overlay with scanning frame */}
        <View style={styles.overlay}>
          {/* Top overlay */}
          <View style={styles.overlayTop}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log('[BarcodeScanner] Close button pressed');
                hasScannedRef.current = false;
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
            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsText}>
                Align the barcode within the frame
              </Text>
              <Text style={styles.instructionsSubtext}>
                The barcode will be scanned automatically
              </Text>
            </View>
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
});
