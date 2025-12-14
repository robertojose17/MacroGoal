
import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { IconSymbol } from './IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface SwipeableListItemProps {
  children: ReactNode;
  onDelete: () => void;
  deleteButtonText?: string;
  deleteButtonColor?: string;
}

const DELETE_BUTTON_WIDTH = 80;
const SWIPE_THRESHOLD = -60; // Threshold to lock open

export default function SwipeableListItem({
  children,
  onDelete,
  deleteButtonText = 'Delete',
  deleteButtonColor = '#FF3B30',
}: SwipeableListItemProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const translateX = useSharedValue(0);
  const isOpen = useSharedValue(false);
  const isDeleting = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      if (isDeleting.value) return;
      
      // If row is open and user swipes right, allow closing
      if (isOpen.value && event.translationX > 0) {
        const newTranslation = -DELETE_BUTTON_WIDTH + event.translationX;
        translateX.value = Math.min(0, newTranslation);
      }
      // If row is closed and user swipes left, allow opening
      else if (!isOpen.value && event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -DELETE_BUTTON_WIDTH * 1.5);
      }
    })
    .onEnd(() => {
      if (isDeleting.value) return;
      
      // If row is open and user swipes right past halfway, close it
      if (isOpen.value && translateX.value > -DELETE_BUTTON_WIDTH / 2) {
        translateX.value = withTiming(0, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
        isOpen.value = false;
      }
      // If row is open but user didn't swipe enough, keep it open
      else if (isOpen.value) {
        translateX.value = withTiming(-DELETE_BUTTON_WIDTH, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
      }
      // If row is closed and user swiped left past threshold, lock it open
      else if (translateX.value < SWIPE_THRESHOLD) {
        translateX.value = withTiming(-DELETE_BUTTON_WIDTH, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
        isOpen.value = true;
      }
      // If row is closed and user didn't swipe enough, snap back
      else {
        translateX.value = withTiming(0, {
          duration: 150,
          easing: Easing.out(Easing.cubic),
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < -10 ? 1 : 0,
  }));

  const handleDelete = () => {
    if (isDeleting.value) return;
    isDeleting.value = true;
    
    // Call onDelete IMMEDIATELY - no delay
    // The parent will remove the item from the array and this component will unmount
    onDelete();
  };

  return (
    <View style={styles.container}>
      {/* Delete button (behind the item) */}
      <Animated.View style={[styles.deleteButtonContainer, deleteButtonStyle]}>
        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: deleteButtonColor }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <IconSymbol
            ios_icon_name="trash.fill"
            android_material_icon_name="delete"
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.deleteButtonText}>{deleteButtonText}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Swipeable content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.content, animatedStyle]}>
          <View style={[
            styles.contentInner,
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
  },
  deleteButtonContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_BUTTON_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    backgroundColor: 'transparent',
  },
  contentInner: {
    width: '100%',
  },
});
