import React, { useRef, useCallback } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ─── ZoomablePhoto ────────────────────────────────────────────────────────────

export interface ZoomablePhotoProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
}

export function ZoomablePhoto({ uri, style }: ZoomablePhotoProps): JSX.Element {
  // ── Animated values ──────────────────────────────────────────────────────
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // ── Mutable refs (no re-render needed) ───────────────────────────────────
  const currentScale = useRef(1);
  const currentTx = useRef(0);
  const currentTy = useRef(0);

  // Pinch tracking
  const initialDistance = useRef<number | null>(null);
  const scaleAtGestureStart = useRef(1);

  // Pan tracking
  const txAtGestureStart = useRef(0);
  const tyAtGestureStart = useRef(0);
  const panStartX = useRef(0);
  const panStartY = useRef(0);

  // Double-tap tracking
  const lastTapTime = useRef(0);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getDistance = (touches: React.Touch[]): number => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const springBack = useCallback(() => {
    console.log('[ZoomablePhoto] Springing back to scale=1, center');
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
    currentScale.current = 1;
    currentTx.current = 0;
    currentTy.current = 0;
  }, [scale, translateX, translateY]);

  const setScale = useCallback(
    (val: number) => {
      scale.setValue(val);
      currentScale.current = val;
    },
    [scale],
  );

  const setTranslate = useCallback(
    (x: number, y: number) => {
      translateX.setValue(x);
      translateY.setValue(y);
      currentTx.current = x;
      currentTy.current = y;
    },
    [translateX, translateY],
  );

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      // Claim responder on touch start if zoomed in OR 2-finger touch
      onStartShouldSetPanResponder: (_evt, gestureState) => {
        const twoFingers = gestureState.numberActiveTouches === 2;
        const zoomed = currentScale.current > 1.01;
        const claim = twoFingers || zoomed;
        if (claim) {
          console.log('[ZoomablePhoto] onStartShouldSetPanResponder → true', {
            twoFingers,
            zoomed,
            scale: currentScale.current,
          });
        }
        return claim;
      },

      // Claim responder on move if 2 fingers OR zoomed
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const twoFingers = gestureState.numberActiveTouches === 2;
        const zoomed = currentScale.current > 1.01;
        return twoFingers || zoomed;
      },

      onPanResponderGrant: (evt, _gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          console.log('[ZoomablePhoto] Pinch started, scale:', currentScale.current);
          initialDistance.current = getDistance(touches as unknown as React.Touch[]);
          scaleAtGestureStart.current = currentScale.current;
        } else {
          // Check for double-tap
          const now = Date.now();
          const timeSinceLastTap = now - lastTapTime.current;
          lastTapTime.current = now;
          if (timeSinceLastTap < 300) {
            // Double-tap: toggle between scale 1 and 2
            const targetScale = currentScale.current > 1.01 ? 1 : 2;
            console.log('[ZoomablePhoto] Double-tap detected, toggling scale to', targetScale);
            if (targetScale === 1) {
              springBack();
            } else {
              Animated.parallel([
                Animated.spring(scale, { toValue: targetScale, useNativeDriver: true }),
                Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
                Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
              ]).start();
              currentScale.current = targetScale;
              currentTx.current = 0;
              currentTy.current = 0;
            }
            return;
          }

          // Single-finger pan start
          console.log('[ZoomablePhoto] Pan started, scale:', currentScale.current);
          panStartX.current = touches[0].pageX;
          panStartY.current = touches[0].pageY;
          txAtGestureStart.current = currentTx.current;
          tyAtGestureStart.current = currentTy.current;
        }
      },

      onPanResponderMove: (evt, _gestureState) => {
        const touches = evt.nativeEvent.touches;

        if (touches.length === 2) {
          // ── Pinch ──────────────────────────────────────────────────────
          if (initialDistance.current === null) {
            initialDistance.current = getDistance(touches as unknown as React.Touch[]);
            scaleAtGestureStart.current = currentScale.current;
            return;
          }
          const dist = getDistance(touches as unknown as React.Touch[]);
          const newScale = Math.min(
            4.0,
            Math.max(0.5, scaleAtGestureStart.current * (dist / initialDistance.current)),
          );
          setScale(newScale);
        } else if (touches.length === 1 && currentScale.current > 1.01) {
          // ── Pan (only when zoomed) ─────────────────────────────────────
          const dx = touches[0].pageX - panStartX.current;
          const dy = touches[0].pageY - panStartY.current;
          setTranslate(txAtGestureStart.current + dx, tyAtGestureStart.current + dy);
        }
      },

      onPanResponderRelease: (_evt, _gestureState) => {
        console.log('[ZoomablePhoto] Gesture released, scale:', currentScale.current);

        // Reset pinch tracking
        initialDistance.current = null;

        if (currentScale.current < 1.0) {
          // Snapped below minimum — spring back
          springBack();
          return;
        }

        // Clamp pan to reasonable bounds (prevent panning too far off-screen)
        const maxPan = 200 * (currentScale.current - 1);
        const clampedTx = Math.max(-maxPan, Math.min(maxPan, currentTx.current));
        const clampedTy = Math.max(-maxPan, Math.min(maxPan, currentTy.current));

        if (clampedTx !== currentTx.current || clampedTy !== currentTy.current) {
          console.log('[ZoomablePhoto] Clamping pan to bounds', { clampedTx, clampedTy });
          Animated.parallel([
            Animated.spring(translateX, { toValue: clampedTx, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: clampedTy, useNativeDriver: true }),
          ]).start();
          currentTx.current = clampedTx;
          currentTy.current = clampedTy;
        }
      },

      onPanResponderTerminate: () => {
        console.log('[ZoomablePhoto] Gesture terminated');
        initialDistance.current = null;
        if (currentScale.current < 1.0) {
          springBack();
        }
      },
    }),
  ).current;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}>
      <Animated.Image
        source={{ uri }}
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              { translateX },
              { translateY },
              { scale },
            ],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    flex: 1,
  },
});
