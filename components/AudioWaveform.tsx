
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface AudioWaveformProps {
  isRecording: boolean;
  audioLevel?: number; // 0 to 1, representing audio input level
  color?: string;
  barCount?: number;
}

export function AudioWaveform({
  isRecording,
  audioLevel = 0.5,
  color = '#007AFF',
  barCount = 5,
}: AudioWaveformProps) {
  const bars = Array.from({ length: barCount }, (_, i) => i);

  return (
    <View style={styles.container}>
      {bars.map((index) => (
        <AnimatedBar
          key={index}
          isRecording={isRecording}
          audioLevel={audioLevel}
          color={color}
          index={index}
          totalBars={barCount}
        />
      ))}
    </View>
  );
}

interface AnimatedBarProps {
  isRecording: boolean;
  audioLevel: number;
  color: string;
  index: number;
  totalBars: number;
}

function AnimatedBar({ isRecording, audioLevel, color, index, totalBars }: AnimatedBarProps) {
  const height = useSharedValue(8);

  useEffect(() => {
    if (isRecording) {
      // Calculate target height based on audio level
      // Map audioLevel (0-1) to height range (8-32)
      const minHeight = 8;
      const maxHeight = 32;

      // Create a wave effect across bars
      // Center bars react more to audio, edge bars less
      const centerIndex = (totalBars - 1) / 2;
      const distanceFromCenter = Math.abs(index - centerIndex);
      const barMultiplier = 1 - (distanceFromCenter / (totalBars / 2)) * 0.3; // 0.7 to 1.0

      const targetHeight = minHeight + audioLevel * (maxHeight - minHeight) * barMultiplier;

      // Animate to target height with spring for natural feel
      height.value = withSpring(targetHeight, {
        damping: 8,
        stiffness: 150,
        mass: 0.3,
      });
    } else {
      // Reset to minimum height when not recording
      height.value = withTiming(8, { duration: 200 });
    }
  }, [isRecording, audioLevel, index, totalBars]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        {
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 40,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    minHeight: 8,
  },
});
