
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { toLocalDateString } from '@/utils/dateUtils';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { packageBarcodeInput } from '@/utils/packageBarcodeInput';
import { recoveryRouteContext } from '@/utils/recoveryRouteContext';
import { buildSyntheticOffData } from '@/utils/servingParser';

export default function BarcodeScannerScreen() {
  const { t, i18n } = useTranslation();
  const es=i18n.language.startsWith('es');
  const router = useRouter();
  const params = useLocalSearchParams();
  // Match the app's fixed light-palette policy without an impossible dark comparison.
  const isDark = false;

  const mode = (params.mode as string) || 'diary';
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;
  const myMealId = (params.mealId as string) || undefined;
  const planId = (params.planId as string) || undefined;

  const [webBarcode,setWebBarcode]=useState(''),[webError,setWebError]=useState(''),[webBusy,setWebBusy]=useState(false);
  const webGeneration=useRef(0),webRequest=useRef<AbortController|null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  // One-scan lock using ref (doesn't cause re-renders)
  const hasScannedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isClosingRef = useRef(false);

  useEffect(() => {
    console.log('[BarcodeScanner] ========== COMPONENT MOUNTED ==========');
    console.log('[BarcodeScanner] Params:', { mode, context, mealType, date, returnTo, myMealId, planId });
    isMountedRef.current = true;

    return () => {
      console.log('[BarcodeScanner] ========== COMPONENT UNMOUNTED ==========');
      isMountedRef.current = false;
    };
  }, [mode, context, mealType, date, returnTo, myMealId, planId]);

  // Reset state when screen gains focus
  useFocusEffect(
    useCallback(() => {
      console.log('[BarcodeScanner] Screen focused → reset scan state');
      hasScannedRef.current = false;
      isClosingRef.current = false;
      if(Platform.OS==='web'){webGeneration.current++;setWebBusy(false);}

      return () => {
        if(Platform.OS==='web'){webGeneration.current++;isClosingRef.current=true;webRequest.current?.abort();}
        console.log('[BarcodeScanner] Screen unfocused');
      };
    }, [])
  );

  /**
   * Perform lookup via Supabase edge function (lookup-barcode) and navigate.
   * Falls back to barcode-lookup screen on error or not-found.
   */
  const performLookupAndNavigate = useCallback(async (barcode: string) => {
    console.log('[BarcodeScanner] ========== PERFORMING LOOKUP ==========');
    console.log('[BarcodeScanner] Barcode:', barcode);
    console.log('[BarcodeScanner] Routing through edge function: lookup-barcode');

    const generation=webGeneration.current;
    const current=()=>Platform.OS!=='web'||(generation===webGeneration.current&&isMountedRef.current&&!isClosingRef.current);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if(!current())return;
      if(Platform.OS==='web'&&!session?.access_token){hasScannedRef.current=false;setWebError(es?'Inicia sesión para buscar este producto.':'Sign in to look up this product.');return;}
      const token = session?.access_token;
      console.log('[BarcodeScanner] Auth token present:', !!token);

      const edgeFnUrl = `${SUPABASE_PROJECT_URL}/functions/v1/lookup-barcode`;
      console.log('[BarcodeScanner] Edge function URL:', edgeFnUrl);

      const controller = new AbortController();
      if(Platform.OS==='web')webRequest.current=controller;
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response:Response;
      try {response = await fetch(edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ barcode, review_capability: 'label_confirmation_v1' }),
        signal: controller.signal,
      });}finally{clearTimeout(timeoutId);}
      if(!current())return;

      console.log('[BarcodeScanner] HTTP Status:', response.status);

      if (!response.ok) {
        if (response.status === 409 || response.status === 426) {
          const failure = await response.json().catch(() => null);
          if(!current() || !isMountedRef.current || isClosingRef.current)return;
          if (response.status === 426 || (failure?.status === 'update_required' && failure?.error === 'LOOKUP_REVIEW_UPDATE_REQUIRED')) {
            router.replace({ pathname: '/search-food-confirmation', params: { ...recoveryRouteContext(params), reason: 'update_required' } });
            return;
          }
          throw new Error(`HTTP error: ${response.status}`);
        }
        const errText = await response.text();
        console.error('[BarcodeScanner] Edge function error body:', errText);
        throw new Error(`HTTP error: ${response.status}`);
      }

      const result = await response.json();
      if(!current())return;
      console.log('[BarcodeScanner] Edge function result — found:', result.found, 'source:', result.source);

      // A found AI-only read is still a proposal. Never forward its nutrition, ID or unsigned evidence.
      // Existing alias collisions cannot be resolved by the current photo/manual flow.
      if (result.capture_status === 'ambiguous_existing' || result.capture_status === 'identity_reserved') {
        if (!current() || !isMountedRef.current || isClosingRef.current) return;
        router.replace({ pathname: '/search-food-confirmation', params: { ...recoveryRouteContext(params), reason: 'catalog_ambiguous' } });
        return;
      }
      // Present malformed flags are ambiguous contract data, not permission to use a proposal.
      const invalidConfirmationFlag = Object.prototype.hasOwnProperty.call(result, 'requires_label_confirmation')
        && typeof result.requires_label_confirmation !== 'boolean';
      if (result.requires_label_confirmation === true || invalidConfirmationFlag) {
        if (!isMountedRef.current || isClosingRef.current) return;
        router.push({pathname:'/food-photo-capture',params:{
          ...recoveryRouteContext(params),barcode,type:'new_product',
          meal:mealType,date,mode,context,returnTo,mealId:myMealId || '',planId:planId || '',
        }});
        return;
      }

      if (result.found) {
        // Always build synthetic offData from DB columns — single source of truth.
        // Preserve the server's explicit basis; legacy rows without one are per 100 g.
        const itemWithDefaults = {
          ...result.item,
          macros_per: result.item?.macros_per ?? '100g',
          name: result.item?.name || '',
        };
        const offData = buildSyntheticOffData(itemWithDefaults);

        console.log('[BarcodeScanner] ✅ PRODUCT FOUND via', result.source, '— building synthetic off_data from item (server nutrition basis preserved)');
        console.log('[BarcodeScanner] product_name resolved to:', offData?.product_name || offData?.generic_name || '(empty)');

        console.log('[BarcodeScanner] 🚀 Navigating to food-details');
        console.log('[BarcodeScanner] Context:', context);
        console.log('[BarcodeScanner] ReturnTo:', returnTo);

        if (!isMountedRef.current || isClosingRef.current) return;
        router.push({
          pathname: '/food-details',
          params: {
            offData: JSON.stringify(offData),
            meal: mealType,
            date: date,
            mode: mode,
            context: context,
            returnTo: returnTo,
            mealId: myMealId || '',
            planId: planId || '',
            source: 'barcode',
            food_item_id: result.item?.id || '',
          },
        });
      } else {
        console.log('[BarcodeScanner] ❌ PRODUCT NOT FOUND, requesting package front');

        if (!isMountedRef.current || isClosingRef.current) return;
        router.push({
          pathname: '/food-photo-capture',
          params: {
            barcode: barcode,
            type: 'new_product',
            meal: mealType,
            date: date,
            mode: mode,
            context: context,
            returnTo: returnTo,
            mealId: myMealId || '',
            planId: planId || '',
          },
        });
      }
    } catch (error: any) {
      console.error('[BarcodeScanner] ❌ LOOKUP ERROR:', error);

      if (!current() || !isMountedRef.current || isClosingRef.current) return;
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
          planId: planId || '',
          error: error.message || 'Lookup failed',
        },
      });
    } finally {if(Platform.OS==='web'&&current()){setWebBusy(false);webRequest.current=null;}}
  }, [router, mealType, date, mode, context, returnTo, myMealId, planId, es, params]);

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

  const submitWebBarcode=()=>{
    if(hasScannedRef.current||isClosingRef.current||!isMountedRef.current)return;
    const barcode=packageBarcodeInput(webBarcode);
    if(!barcode){setWebError(es?'Ingresa los 8, 12, 13 o 14 dígitos del código del paquete.':'Enter the package code: 8, 12, 13 or 14 digits.');return;}
    hasScannedRef.current=true;setWebError('');setWebBusy(true);
    void performLookupAndNavigate(barcode);
  };
  // SDK54 web camera scanning supports QR only, not product EAN/UPC barcodes.
  // This entry does the same lookup first; camera permission waits until package photos.
  if(Platform.OS==='web')return (
    <SafeAreaView style={[styles.container,{backgroundColor:isDark?colors.backgroundDark:colors.background}]} edges={['top']}>
      <View style={[styles.permissionContainer,{gap:16}]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={es?'Atrás':'Back'} onPress={()=>{isClosingRef.current=true;webGeneration.current++;webRequest.current?.abort();router.back();}}>
          <Text style={{color:isDark?colors.textDark:colors.text}}>{es?'Atrás':'Back'}</Text>
        </TouchableOpacity>
        <Text style={[styles.permissionTitle,{color:isDark?colors.textDark:colors.text}]}>{es?'Ingresa el código del paquete':'Enter the package barcode'}</Text>
        <Text style={[styles.permissionText,{color:isDark?colors.textSecondaryDark:colors.textSecondary}]}>{es?'En esta versión web, escribe el número bajo el código de barras. Primero buscaremos el producto; si no aparece, podrás fotografiar el empaque.':'In this web version, type the number beneath the barcode. We will look up the product first; if it is not found, you can photograph the package.'}</Text>
        <TextInput accessibilityLabel={es?'Código de barras del paquete':'Package barcode'} value={webBarcode} onChangeText={setWebBarcode}
          keyboardType="number-pad" inputMode="numeric" maxLength={14} editable={!webBusy} onSubmitEditing={submitWebBarcode}
          style={{width:'100%',maxWidth:420,borderWidth:1,borderColor:colors.primary,borderRadius:12,padding:16,color:isDark?colors.textDark:colors.text}}/>
        {!!webError&&<Text accessibilityRole="alert" style={{color:isDark?colors.textDark:colors.text}}>{webError}</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:webBusy}} disabled={webBusy} style={[styles.permissionButton,{backgroundColor:colors.primary,opacity:webBusy?0.5:1}]} onPress={submitWebBarcode}>
          <Text style={styles.permissionButtonText}>{es?'Buscar producto':'Look up product'}</Text>
        </TouchableOpacity>
        {webBusy&&<ActivityIndicator/>}
      </View>
    </SafeAreaView>
  );

  // Show loading while checking permissions
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('barcodeScanner.checkingPermissions')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Undetermined: show explanation with a single "Continue" button — no dismiss option
  if (permission.status === 'undetermined') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.permissionContainer}>
          <IconSymbol
            ios_icon_name="camera.fill"
            android_material_icon_name="camera_alt"
            size={72}
            color={colors.primary}
          />
          <Text style={[styles.permissionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('barcodeScanner.cameraAccess')}
          </Text>
          <Text style={[styles.permissionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('barcodeScanner.cameraAccessDesc')}
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[BarcodeScanner] Continue pressed — requesting camera permission');
              requestPermission();
            }}
          >
            <Text style={styles.permissionButtonText}>{t('barcodeScanner.continue')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Denied: camera access was refused — guide user to Settings
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            console.log('[BarcodeScanner] Back pressed from denied screen');
            router.back();
          }}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            {t('barcodeScanner.title')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.permissionContainer}>
          <IconSymbol
            ios_icon_name="camera.fill"
            android_material_icon_name="camera_alt"
            size={72}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <Text style={[styles.permissionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('barcodeScanner.cameraAccessRequired')}
          </Text>
          <Text style={[styles.permissionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('barcodeScanner.cameraAccessDeniedDesc')}
          </Text>
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[BarcodeScanner] Open Settings pressed');
              Linking.openURL('app-settings:');
            }}
          >
            <Text style={styles.permissionButtonText}>{t('barcodeScanner.openSettings')}</Text>
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
          onBarcodeScanned={handleBarCodeScanned}
        />

        {/* Overlay with scanning frame */}
        <View style={styles.overlay}>
          {/* Top overlay */}
          <View style={styles.overlayTop}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log('[BarcodeScanner] Close button pressed');
                isClosingRef.current = true;
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
                {t('barcodeScanner.alignBarcode')}
              </Text>
              <Text style={styles.instructionsSubtext}>
                {t('barcodeScanner.autoScanned')}
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
