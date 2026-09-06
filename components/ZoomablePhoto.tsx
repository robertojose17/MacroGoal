
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── AsyncStorage helpers ─────────────────────────────────────────────────────

export async function savePhotoTransform(
  photoId: string,
  scale: number,
  translateX: number,
  translateY: number
): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(`@photoTransform.${photoId}.scale`, String(scale)),
      AsyncStorage.setItem(`@photoTransform.${photoId}.translateX`, String(translateX)),
      AsyncStorage.setItem(`@photoTransform.${photoId}.translateY`, String(translateY)),
    ]);
    console.log('[ZoomablePhoto] Transform saved for', photoId, { scale, translateX, translateY });
  } catch (e) {
    console.warn('[ZoomablePhoto] Failed to save transform for', photoId, e);
  }
}

export async function loadPhotoTransform(
  photoId: string
): Promise<{ scale: number; translateX: number; translateY: number } | null> {
  try {
    const [s, tx, ty] = await Promise.all([
      AsyncStorage.getItem(`@photoTransform.${photoId}.scale`),
      AsyncStorage.getItem(`@photoTransform.${photoId}.translateX`),
      AsyncStorage.getItem(`@photoTransform.${photoId}.translateY`),
    ]);
    if (!s) return null;
    return {
      scale: parseFloat(s),
      translateX: parseFloat(tx ?? '0'),
      translateY: parseFloat(ty ?? '0'),
    };
  } catch {
    return null;
  }
}

// ─── ZoomablePhoto ────────────────────────────────────────────────────────────

export interface ZoomablePhotoProps {
  uri: string;
  photoId: string;
  width: number;
  height: number;
  style?: any;
}

export function ZoomablePhoto({ uri, photoId, width, height }: ZoomablePhotoProps): JSX.Element {
  // Committed (saved) transform values
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Live transform values driven by gestures
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Load persisted transform on mount
  useEffect(() => {
    loadPhotoTransform(photoId).then((saved) => {
      if (saved) {
        console.log('[ZoomablePhoto] Restored transform for', photoId, saved);
        savedScale.value = saved.scale;
        savedTx.value = saved.translateX;
        savedTy.value = saved.translateY;
        scale.value = saved.scale;
        tx.value = saved.translateX;
        ty.value = saved.translateY;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  // Pinch gesture
  const pinch = Gesture.Pinch()
    .runOnJS(false)
    .onUpdate((e) => {
      scale.value = Math.min(4.0, Math.max(1.0, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
      savePhotoTransform(photoId, scale.value, tx.value, ty.value);
    });

  // Pan gesture — activates immediately, captures before parent ScrollView
  const pan = Gesture.Pan()
    .runOnJS(false)
    .minDistance(0)
    .onStart(() => {
      console.log('[ZoomablePhoto] Pan gesture started, photoId:', photoId, 'scale:', savedScale.value);
    })
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      if (scale.value <= 1.01) {
        tx.value = withSpring(0);
        ty.value = withSpring(0);
        savedTx.value = 0;
        savedTy.value = 0;
      }
      console.log('[ZoomablePhoto] Pan gesture ended, saving transform for', photoId, { scale: savedScale.value, tx: savedTx.value, ty: savedTy.value });
      savePhotoTransform(photoId, scale.value, tx.value, ty.value);
    });

  // Simultaneous so pinch + pan work together
  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width, height, overflow: 'hidden' }}>
        <Animated.Image
          source={{ uri }}
          style={[{ width, height }, animatedStyle]}
          resizeMode="cover"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({});
