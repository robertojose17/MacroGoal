import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';

interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
}

const ACTIONS = [
  { id: 'barcode', label: 'Scan Barcode', icon: '📷', route: '/barcode-scanner' },
  { id: 'search', label: 'Search Food', icon: '🔍', route: '/food-search' },
  { id: 'ai', label: 'AI Estimate', icon: '🤖', route: '/chatbot' },
  { id: 'quick', label: 'Quick Add', icon: '✏️', route: '/add-food-simple' },
];

function getSmartMealType(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  if (hour >= 18 && hour < 22) return 'dinner';
  return 'snack';
}

export default function QuickAddSheet({ visible, onClose }: QuickAddSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 24,
          stiffness: 200,
          mass: 0.8,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 300,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  const handleAction = (actionId: string, route: string) => {
    console.log('[QuickAddSheet] Action pressed:', actionId, 'route:', route);
    onClose();
    const mealType = getSmartMealType();
    console.log('[QuickAddSheet] Smart meal type:', mealType);
    // Small delay so sheet closes before navigation
    setTimeout(() => {
      if (route === '/food-search' || route === '/add-food-simple') {
        console.log('[QuickAddSheet] Navigating to:', route, 'with meal:', mealType);
        router.push(`${route}?meal=${mealType}` as any);
      } else {
        console.log('[QuickAddSheet] Navigating to:', route);
        router.push(route as any);
      }
    }, 180);
  };

  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#000000';
  const divider = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const handleColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
  const paddingBottom = insets.bottom + 8;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: cardBg,
            paddingBottom: paddingBottom,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: handleColor }]} />

        {/* Actions */}
        {ACTIONS.map((action, index) => {
          const isLast = index === ACTIONS.length - 1;
          return (
            <View key={action.id}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => handleAction(action.id, action.route)}
                activeOpacity={0.6}
              >
                <Text style={[styles.rowLabel, { color: textPrimary }]}>
                  {action.label}
                </Text>
                <Text style={styles.rowIcon}>{action.icon}</Text>
              </TouchableOpacity>
              {!isLast && (
                <View style={[styles.divider, { backgroundColor: divider }]} />
              )}
            </View>
          );
        })}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.2,
  },
  rowIcon: {
    fontSize: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 24,
  },
});
