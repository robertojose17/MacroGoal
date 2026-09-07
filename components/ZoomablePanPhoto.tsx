
import React, { useCallback, useRef } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  View,
  type ImageResizeMode,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ─── Web / non-native fallback ────────────────────────────────────────────────
// On web the real gesture-handler / reanimated packages are stubbed out, so we
// render a plain Image with a tap handler instead.

// ─── Native implementation ────────────────────────────────────────────────────

// Lazy-require so the module is never evaluated on web (where the stub lives).
let GestureDetector: any = null;
let Gesture: any = null;
let useSharedValue: any = null;
let useAnimatedStyle: any = null;
let withSpring: any = null;
let runOnJS: any = null;
let ReanimatedView: any = null;

if (Platform.OS !== 'web') {
  try {
    const gh = require('react-native-gesture-handler');
    GestureDetector = gh.GestureDetector;
    Gesture = gh.Gesture;
  } catch (_) {}

  try {
    const ra = require('react-native-reanimated');
    useSharedValue = ra.useSharedValue;
    useAnimatedStyle = ra.useAnimatedStyle;
    withSpring = ra.withSpring;
    runOnJS = ra.runOnJS;
    ReanimatedView = ra.View ?? ra.default?.View;
  } catch (_) {}
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZoomablePanPhotoProps {
  uri: string;
  width: number;
  height: number;
  /** Called only when scale === 1 (not zoomed in). */
  onTap?: () => void;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  /** Initial transform to restore a saved position. */
  initialScale?: number;
  initialTranslateX?: number;
  initialTranslateY?: number;
  /** Called (debounced ~200ms) whenever the user changes zoom or pan. */
  onTransformChange?: (scale: number, translateX: number, translateY: number) => void;
}

// ─── Native component (gesture-handler + reanimated) ─────────────────────────

const MIN_SCALE = 1.0;
const MAX_SCALE = 4.0;
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const DEBOUNCE_MS = 200;

function ZoomablePanPhotoNative({
  uri,
  width,
  height,
  onTap,
  style,
  resizeMode = 'cover',
  initialScale = 1,
  initialTranslateX = 0,
  initialTranslateY = 0,
  onTransformChange,
}: ZoomablePanPhotoProps) {
  // ── Debounce timer ref (JS thread) ─────────────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Shared values ──────────────────────────────────────────────────────────
  const scale = useSharedValue(initialScale);
  const savedScale = useSharedValue(initialScale);

  const translateX = useSharedValue(initialTranslateX);
  const translateY = useSharedValue(initialTranslateY);
  const savedTranslateX = useSharedValue(initialTranslateX);
  const savedTranslateY = useSharedValue(initialTranslateY);

  // ── Animated style ─────────────────────────────────────────────────────────
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // ── Debounced transform change notifier (JS thread) ───────────────────────
  const notifyTransformChange = useCallback(
    (s: number, tx: number, ty: number) => {
      if (!onTransformChange) return;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        console.log('[ZoomablePanPhoto] onTransformChange:', s, tx, ty);
        onTransformChange(s, tx, ty);
      }, DEBOUNCE_MS);
    },
    [onTransformChange],
  );

  // ── Reset helper (called from JS thread) ──────────────────────────────────
  const resetZoom = useCallback(() => {
    console.log('[ZoomablePanPhoto] Double-tap reset: scale=1, pan=0,0');
    scale.value = withSpring(1, SPRING_CONFIG);
    savedScale.value = 1;
    translateX.value = withSpring(0, SPRING_CONFIG);
    translateY.value = withSpring(0, SPRING_CONFIG);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    notifyTransformChange(1, 0, 0);
  }, [scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY, notifyTransformChange]);

  const openFullscreen = useCallback(() => {
    if (onTap) {
      console.log('[ZoomablePanPhoto] Tap at scale=1, opening fullscreen');
      onTap();
    }
  }, [onTap]);

  // ── Pinch gesture ──────────────────────────────────────────────────────────
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e: any) => {
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE, SPRING_CONFIG);
        savedScale.value = MIN_SCALE;
      } else {
        savedScale.value = scale.value;
      }
      // If snapped back to 1, also reset pan
      if (scale.value <= MIN_SCALE) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(notifyTransformChange)(1, 0, 0);
      } else {
        runOnJS(notifyTransformChange)(scale.value, translateX.value, translateY.value);
      }
    });

  // ── Pan gesture ────────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e: any) => {
      // Only pan when zoomed in
      if (scale.value <= MIN_SCALE) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= MIN_SCALE) return;
      // Clamp pan so image doesn't fly too far off-screen
      const maxPan = (width / 2) * (scale.value - 1);
      const clampedX = Math.max(-maxPan, Math.min(maxPan, translateX.value));
      const clampedY = Math.max(-maxPan, Math.min(maxPan, translateY.value));
      translateX.value = withSpring(clampedX, SPRING_CONFIG);
      translateY.value = withSpring(clampedY, SPRING_CONFIG);
      savedTranslateX.value = clampedX;
      savedTranslateY.value = clampedY;
      runOnJS(notifyTransformChange)(scale.value, clampedX, clampedY);
    });

  // ── Double-tap gesture ─────────────────────────────────────────────────────
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((_e: any, success: boolean) => {
      if (!success) return;
      runOnJS(resetZoom)();
    });

  // ── Single-tap gesture (open fullscreen only when not zoomed) ──────────────
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(doubleTapGesture)
    .onEnd((_e: any, success: boolean) => {
      if (!success) return;
      if (scale.value <= MIN_SCALE) {
        runOnJS(openFullscreen)();
      }
    });

  // ── Compose all gestures ───────────────────────────────────────────────────
  const composed = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Race(doubleTapGesture, singleTapGesture),
  );

  return (
    <View style={[{ width, height, overflow: 'hidden' }, style]}>
      <GestureDetector gesture={composed}>
        <ReanimatedView style={[StyleSheet.absoluteFill, animatedStyle]}>
          <Image
            source={{ uri }}
            style={{ width, height }}
            resizeMode={resizeMode}
          />
        </ReanimatedView>
      </GestureDetector>
    </View>
  );
}

// ─── Web / fallback component ─────────────────────────────────────────────────

function ZoomablePanPhotoFallback({
  uri,
  width,
  height,
  onTap,
  style,
  resizeMode = 'cover',
}: ZoomablePanPhotoProps) {
  return (
    <View
      style={[{ width, height, overflow: 'hidden' }, style]}
      // @ts-expect-error — web only
      onClick={onTap}
    >
      <Image
        source={{ uri }}
        style={{ width, height }}
        resizeMode={resizeMode}
      />
    </View>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function ZoomablePanPhoto(props: ZoomablePanPhotoProps) {
  const canUseGestures =
    Platform.OS !== 'web' &&
    GestureDetector !== null &&
    Gesture !== null &&
    useSharedValue !== null &&
    useAnimatedStyle !== null &&
    withSpring !== null &&
    runOnJS !== null &&
    ReanimatedView !== null;

  if (canUseGestures) {
    return <ZoomablePanPhotoNative {...props} />;
  }
  return <ZoomablePanPhotoFallback {...props} />;
}
