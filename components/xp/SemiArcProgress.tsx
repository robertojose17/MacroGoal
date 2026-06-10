/**
 * SemiArcProgress
 *
 * A half-donut arc progress indicator using react-native-svg.
 * The arc spans 180° with the curve at the top and the opening at the bottom.
 * Children are rendered inside the bowl area of the arc.
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface SemiArcProgressProps {
  progress: number;       // 0–1
  size: number;           // width of the arc (e.g. 180)
  strokeWidth: number;    // e.g. 14
  color: string;          // fill color (rank.primaryColor)
  trackColor: string;     // background track color
  children?: React.ReactNode;
}

/**
 * Build an SVG arc path string for a semi-circle.
 * The arc goes from the left end to the right end, curving upward (opening downward).
 *
 * cx, cy = center of the full circle
 * r      = radius of the arc center-line
 * startAngle / endAngle in degrees (0 = right, 90 = down, 180 = left)
 */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  // large-arc-flag = 1 for 180°, sweep-flag = 1 for clockwise
  return `M ${x1} ${y1} A ${r} ${r} 0 1 1 ${x2} ${y2}`;
}

export default function SemiArcProgress({
  progress,
  size,
  strokeWidth,
  color,
  trackColor,
  children,
}: SemiArcProgressProps) {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const r = size / 2 - strokeWidth / 2;
  const cx = size / 2;
  // cy is at the bottom of the SVG viewport so the arc curves upward
  const cy = size / 2;
  const arcLength = Math.PI * r;

  const dashOffsetAnim = useRef(new Animated.Value(arcLength)).current;

  useEffect(() => {
    console.log('[SemiArcProgress] mounted, progress:', clampedProgress);
    Animated.timing(dashOffsetAnim, {
      toValue: arcLength * (1 - clampedProgress),
      duration: 800,
      useNativeDriver: false,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(dashOffsetAnim, {
      toValue: arcLength * (1 - clampedProgress),
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [clampedProgress, arcLength, dashOffsetAnim]);

  // Arc from 180° (left) to 0° (right), curving upward
  // In SVG coords: 180° = left point, 0° = right point
  const trackPath = describeArc(cx, cy, r, 180, 0);
  const fillPath = describeArc(cx, cy, r, 180, 0);

  const svgHeight = size / 2 + strokeWidth;

  return (
    <View style={[styles.container, { width: size, height: svgHeight }]}>
      <Svg width={size} height={svgHeight} style={StyleSheet.absoluteFill}>
        {/* Track */}
        <Path
          d={trackPath}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
        {/* Animated fill */}
        <AnimatedPath
          d={fillPath}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffsetAnim}
        />
      </Svg>

      {/* Children rendered inside the arc bowl */}
      <View
        style={[
          styles.childrenContainer,
          {
            top: strokeWidth + 8,
            bottom: 0,
            left: 0,
            right: 0,
            paddingLeft: size * 0.18,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  childrenContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
});
