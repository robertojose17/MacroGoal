
import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface SwipeToDeleteRowProps {
  children: ReactNode;
  onDelete: () => void;
  deleteButtonText?: string;
  deleteButtonColor?: string;
}

const DELETE_BUTTON_WIDTH = 90;
const SWIPE_THRESHOLD = -70; // Threshold to lock open
const FULL_SWIPE_THRESHOLD = -150; // Threshold for immediate delete

export default function SwipeToDeleteRow({
  children,
  onDelete,
  deleteButtonText = 'Delete',
  deleteButtonColor = '#FF3B30',
}: SwipeToDeleteRowProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const translateX = useSharedValue(0);
  const isDeleting = useSharedValue(false);

  const handleDelete = () => {
    if (isDeleting.value) return;
    isDeleting.value = true;
    
    // Call onDelete IMMEDIATELY - no delay
    // The parent will remove the item from the array and this component will unmount
    runOnJS(onDelete)();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      if (isDeleting.value) return;
      
      // Only allow left swipe (negative translation)
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -DELETE_BUTTON_WIDTH * 2);
      } else if (event.translationX > 0 && translateX.value < 0) {
        // Allow swiping right to close if already open
        const newTranslation = translateX.value + event.translationX;
        translateX.value = Math.min(0, newTranslation);
      }
    })
    .onEnd((event) => {
      if (isDeleting.value) return;
      
      const velocity = event.velocityX;
      const translation = translateX.value;
      
      // Full swipe: delete immediately
      if (translation < FULL_SWIPE_THRESHOLD || velocity < -1000) {
        runOnJS(handleDelete)();
        return;
      }
      
      // Partial swipe past threshold: lock open
      if (translation < SWIPE_THRESHOLD) {
        translateX.value = withTiming(-DELETE_BUTTON_WIDTH, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
      } else {
        // Not past threshold: close
        translateX.value = withTiming(0, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedDeleteStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -10 ? 1 : 0,
  }));

  return (
    <View style={styles.container}>
      {/* Delete button background (behind the row) */}
      <Animated.View style={[styles.deleteBackground, animatedDeleteStyle]}>
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: deleteButtonColor }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.deleteButtonText}>{deleteButtonText}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Swipeable content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.row, animatedRowStyle]}>
          <View style={[
            styles.rowContent,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}>
            {children}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 12,
    marginBottom: 1,
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH + 20,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  deleteButton: {
    width: DELETE_BUTTON_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    gap: 4,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    width: '100%',
  },
  rowContent: {
    width: '100%',
    borderRadius: 12,
  },
});
