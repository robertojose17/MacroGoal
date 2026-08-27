
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { buildSyntheticOffData } from '@/utils/servingParser';

type Step = 'label' | 'front' | 'processing' | 'success' | 'error';

export default function FoodPhotoCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const barcode = params.barcode as string;
  const type = (params.type as 'correction' | 'new_product') || 'correction';
  const food_item_id = params.food_item_id as string | undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = params.date as string;
  const mode = (params.mode as string) || 'diary';
  const context = params.context as string | undefined;
  const returnTo = params.returnTo as string | undefined;
  const mealId = params.mealId as string | undefined;

  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('label');
  const [labelPhotoUrl, setLabelPhotoUrl] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('Analyzing nutrition label...');
  const [errorMessage, setErrorMessage] = useState('');
  const cameraRef = useRef<any>(null);
  const isCapturingRef = useRef(false);

  const uploadPhoto = async (uri: string, filename: string): Promise<string> => {
    console.log('[FoodPhotoCapture] uploadPhoto: uploading', filename, 'from uri:', uri);
    const response = await fetch(uri);
    const blob = await response.blob();
    const path = `submissions/${Date.now()}_${filename}.jpg`;

    const { error } = await supabase.storage
      .from('food-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) {
      console.error('[FoodPhotoCapture] uploadPhoto: storage error:', error.message);
      throw error;
    }

    const { data } = supabase.storage.from('food-photos').getPublicUrl(path);
    console.log('[FoodPhotoCapture] uploadPhoto: public URL:', data.publicUrl);
    return data.publicUrl;
  };

  const callEdgeFunction = useCallback(async (labelUrl: string, frontUrl: string | null) => {
    try {
      console.log('[FoodPhotoCapture] callEdgeFunction: type=', type, 'barcode=', barcode, 'food_item_id=', food_item_id);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const requestBody = {
        barcode,
        photo_label_url: labelUrl,
        photo_front_url: frontUrl,
        type,
        food_item_id: food_item_id || null,
      };
      console.log('[FoodPhotoCapture] callEdgeFunction: POST verify-food-submission body:', JSON.stringify(requestBody));

      const response = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/vision-nutrition-extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('[FoodPhotoCapture] callEdgeFunction: HTTP error', response.status, errText.slice(0, 200));
        setErrorMessage('Server error. Please try again later.');
        setStep('error');
        return;
      }

      const result = await response.json();
      console.log('[FoodPhotoCapture] callEdgeFunction: result status=', result.status);

      if (result.status === 'needs_front_photo') {
        console.log('[FoodPhotoCapture] callEdgeFunction: AI requests front photo');
        setStep('front');
        return;
      }

      if (result.status === 'approved' && result.food_item) {
        const offData = buildSyntheticOffData({
          ...result.food_item,
          macros_per: '100g',
        });

        console.log('[FoodPhotoCapture] callEdgeFunction: approved, navigating to food-details, food_item id=', result.food_item.id);
        setStep('success');

        setTimeout(() => {
          router.replace({
            pathname: '/food-details',
            params: {
              offData: JSON.stringify(offData),
              meal: mealType,
              date: date,
              mode: mode,
              context: context,
              returnTo: returnTo,
              mealId: mealId || '',
              food_item_id: result.food_item.id,
              source: 'barcode',
            },
          });
        }, 1500);
      } else {
        const msg = result.message || 'Could not verify this product. Please try again with a clearer photo.';
        console.warn('[FoodPhotoCapture] callEdgeFunction: not approved, message=', msg);
        setErrorMessage(msg);
        setStep('error');
      }
    } catch (err: any) {
      console.error('[FoodPhotoCapture] callEdgeFunction: error:', err);
      setErrorMessage('Connection error. Please check your internet and try again.');
      setStep('error');
    }
  }, [barcode, type, food_item_id, mealType, date, mode, context, returnTo, mealId, router]);

  const capturePhoto = useCallback(async () => {
    if (isCapturingRef.current || !cameraRef.current) return;
    isCapturingRef.current = true;
    console.log('[FoodPhotoCapture] capturePhoto: step=', step);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
      console.log('[FoodPhotoCapture] capturePhoto: photo taken, uri=', photo.uri);

      if (step === 'label') {
        // For correction/new_product: upload silently without showing processing spinner
        // so the camera stays available for the front photo step
        if (type === 'new_product' || type === 'correction') {
          setStep('processing');
          setProcessingMessage('Uploading label photo...');
          const uploadedUrl = await uploadPhoto(photo.uri, 'label');
          setLabelPhotoUrl(uploadedUrl);
          console.log('[FoodPhotoCapture] capturePhoto: type=', type, '— moving to front photo step');
          setStep('front');
          isCapturingRef.current = false;
          return;
        }

        setStep('processing');
        setProcessingMessage('Analyzing nutrition label...');
        const uploadedUrl = await uploadPhoto(photo.uri, 'label');
        setLabelPhotoUrl(uploadedUrl);
        await callEdgeFunction(uploadedUrl, null);

      } else if (step === 'front') {
        setStep('processing');
        setProcessingMessage('Verifying product...');

        const uploadedUrl = await uploadPhoto(photo.uri, 'front');
        await callEdgeFunction(labelPhotoUrl!, uploadedUrl);
      }
    } catch (err: any) {
      console.error('[FoodPhotoCapture] capturePhoto: error:', err);
      setErrorMessage('Failed to capture or upload photo. Please try again.');
      setStep('error');
    } finally {
      isCapturingRef.current = false;
    }
  }, [step, type, labelPhotoUrl, callEdgeFunction]);

  const handleRetry = () => {
    console.log('[FoodPhotoCapture] handleRetry: resetting to label step');
    setStep('label');
    setLabelPhotoUrl(null);
    setErrorMessage('');
    isCapturingRef.current = false;
  };

  // Permission loading
  if (!permission) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            console.log('[FoodPhotoCapture] Back button pressed (permission screen)');
            router.back();
          }}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={isDark ? colors.textDark : colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>Camera Access</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContainer}>
          <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="camera_alt" size={64} color={colors.primary} />
          <Text style={[styles.h2, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>Camera Required</Text>
          <Text style={[styles.body, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
            Camera access is needed to take photos of nutrition labels.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: spacing.xl }]}
            onPress={() => {
              console.log('[FoodPhotoCapture] Allow Camera button pressed');
              requestPermission();
            }}
          >
            <Text style={styles.primaryButtonText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Processing state
  if (step === 'processing') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.h2, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>
            {processingMessage}
          </Text>
          <Text style={[styles.body, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
            This usually takes a few seconds
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Success state
  if (step === 'success') {
    const successTitle = type === 'new_product' ? 'Product Added!' : 'Data Updated!';
    const successBody = type === 'new_product'
      ? 'This product is now available for everyone.'
      : 'Nutrition data has been updated for all users.';
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.centerContainer}>
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={80} color="#4CAF50" />
          <Text style={[styles.h2, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>
            {successTitle}
          </Text>
          <Text style={[styles.body, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
            {successBody}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (step === 'error') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            console.log('[FoodPhotoCapture] Back button pressed (error screen)');
            router.back();
          }}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={isDark ? colors.textDark : colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>Verification Failed</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerContainer}>
          <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={64} color="#FF9500" />
          <Text style={[styles.h2, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>Could Not Verify</Text>
          <Text style={[styles.body, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: spacing.xl }]}
            onPress={() => {
              console.log('[FoodPhotoCapture] Try Again button pressed');
              handleRetry();
            }}
          >
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { marginTop: spacing.md }]}
            onPress={() => {
              console.log('[FoodPhotoCapture] Cancel button pressed (error screen)');
              router.back();
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: isDark ? colors.textDark : colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Camera view (label or front step)
  const isLabelStep = step === 'label';
  const instructionTitle = isLabelStep ? 'Nutrition Label' : 'Product Front';
  const instructionText = isLabelStep
    ? 'Point your camera at the nutrition facts label'
    : 'Now take a photo of the front of the product';
  const instructionSubtext = isLabelStep
    ? 'Make sure the entire label is visible and well-lit'
    : 'Show the product name and brand clearly';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#000' }]} edges={['top']}>
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.overlayHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                console.log('[FoodPhotoCapture] Close button pressed (camera screen), step=', step);
                router.back();
              }}
            >
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.overlayTitle}>{instructionTitle}</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Step indicator for new_product and correction */}
          {(type === 'new_product' || type === 'correction') && (
            <View style={styles.stepIndicator}>
              <View style={[styles.stepDot, isLabelStep ? styles.stepDotActive : styles.stepDotDone]} />
              <View style={styles.stepLine} />
              <View style={[styles.stepDot, !isLabelStep ? styles.stepDotActive : styles.stepDotInactive]} />
            </View>
          )}

          {/* Bottom instructions + capture button */}
          <View style={styles.overlayBottom}>
            <Text style={styles.instructionTitle}>{instructionText}</Text>
            <Text style={styles.instructionSubtext}>{instructionSubtext}</Text>

            <TouchableOpacity
              style={styles.captureButton}
              onPress={() => {
                console.log('[FoodPhotoCapture] Capture button pressed, step=', step);
                capturePhoto();
              }}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: { ...typography.h3, flex: 1, textAlign: 'center' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  h2: { ...typography.h2, textAlign: 'center' },
  body: { ...typography.body },
  primaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  overlayTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  stepDot: { width: 12, height: 12, borderRadius: 6 },
  stepDotActive: { backgroundColor: '#FFF' },
  stepDotDone: { backgroundColor: '#4CAF50' },
  stepDotInactive: { backgroundColor: 'rgba(255,255,255,0.4)' },
  stepLine: { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.4)', marginHorizontal: spacing.sm },
  overlayBottom: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xl,
    paddingBottom: 48,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  instructionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: spacing.xs },
  instructionSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center', marginBottom: spacing.xl },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 3, borderColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
  },
  captureButtonInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FFF',
  },
});
