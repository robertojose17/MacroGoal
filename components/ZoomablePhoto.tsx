
import React, { useRef, useEffect } from 'react';
import { Animated, PanResponder } from 'react-native';
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
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Track raw values for math
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  // For pinch: track initial distance between 2 touches
  const initialDistance = useRef<number | null>(null);
  const initialScale = useRef(1);

  // For pan: track initial touch centroid
  const initialTouchX = useRef(0);
  const initialTouchY = useRef(0);
  const initialTxRef = useRef(0);
  const initialTyRef = useRef(0);

  useEffect(() => {
    loadPhotoTransform(photoId).then((saved) => {
      if (saved) {
        scaleRef.current = saved.scale;
        txRef.current = saved.translateX;
        tyRef.current = saved.translateY;
        scale.setValue(saved.scale);
        translateX.setValue(saved.translateX);
        translateY.setValue(saved.translateY);
        console.log('[ZoomablePhoto] Restored transform for', photoId, saved);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          const dx = touches[1].pageX - touches[0].pageX;
          const dy = touches[1].pageY - touches[0].pageY;
          initialDistance.current = Math.sqrt(dx * dx + dy * dy);
          initialScale.current = scaleRef.current;
          initialTouchX.current = (touches[0].pageX + touches[1].pageX) / 2;
          initialTouchY.current = (touches[0].pageY + touches[1].pageY) / 2;
        } else {
          initialTouchX.current = touches[0].pageX;
          initialTouchY.current = touches[0].pageY;
        }
        initialTxRef.current = txRef.current;
        initialTyRef.current = tyRef.current;
        console.log('[ZoomablePhoto] Gesture started, touches:', touches.length, 'photoId:', photoId);
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2 && initialDistance.current !== null) {
          const dx = touches[1].pageX - touches[0].pageX;
          const dy = touches[1].pageY - touches[0].pageY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const newScale = Math.min(4.0, Math.max(1.0, initialScale.current * (dist / initialDistance.current)));
          scaleRef.current = newScale;
          scale.setValue(newScale);
          const cx = (touches[0].pageX + touches[1].pageX) / 2;
          const cy = (touches[0].pageY + touches[1].pageY) / 2;
          const newTx = initialTxRef.current + (cx - initialTouchX.current);
          const newTy = initialTyRef.current + (cy - initialTouchY.current);
          txRef.current = newTx;
          tyRef.current = newTy;
          translateX.setValue(newTx);
          translateY.setValue(newTy);
        } else if (touches.length === 1) {
          const newTx = initialTxRef.current + (touches[0].pageX - initialTouchX.current);
          const newTy = initialTyRef.current + (touches[0].pageY - initialTouchY.current);
          txRef.current = newTx;
          tyRef.current = newTy;
          translateX.setValue(newTx);
          translateY.setValue(newTy);
        }
      },
      onPanResponderRelease: () => {
        initialDistance.current = null;
        console.log('[ZoomablePhoto] Gesture released, saving transform for', photoId, { scale: scaleRef.current, translateX: txRef.current, translateY: tyRef.current });
        savePhotoTransform(photoId, scaleRef.current, txRef.current, tyRef.current);
      },
      onPanResponderTerminate: () => {
        initialDistance.current = null;
        console.log('[ZoomablePhoto] Gesture terminated, saving transform for', photoId, { scale: scaleRef.current, translateX: txRef.current, translateY: tyRef.current });
        savePhotoTransform(photoId, scaleRef.current, txRef.current, tyRef.current);
      },
    })
  ).current;

  return (
    <Animated.View
      style={{ width, height, overflow: 'hidden' }}
      {...panResponder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={[
          { width, height },
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
        resizeMode="cover"
      />
    </Animated.View>
  );
}
