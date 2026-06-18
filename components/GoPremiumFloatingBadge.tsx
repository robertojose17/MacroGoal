import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremium } from '@/hooks/usePremium';

const DISMISSED_KEY = '@go_premium_badge_dismissed_date';

export default function GoPremiumFloatingBadge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePremium();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function checkDismissed() {
      try {
        const stored = await AsyncStorage.getItem(DISMISSED_KEY);
        if (!stored) {
          setVisible(true);
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        if (stored !== today) {
          setVisible(true);
        }
      } catch {
        setVisible(true);
      }
    }
    if (!isPremium) checkDismissed();
  }, [isPremium]);

  const handleDismiss = async () => {
    console.log('[GoPremiumBadge] Dismissed by user');
    const today = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(DISMISSED_KEY, today);
    setVisible(false);
  };

  const handlePress = () => {
    console.log('[GoPremiumBadge] Tapped — navigating to /subscription');
    router.push('/subscription');
  };

  if (!visible || isPremium) return null;

  const bottomOffset = insets.bottom + 100;

  return (
    <View style={[styles.container, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <TouchableOpacity
          style={styles.pillContent}
          onPress={handlePress}
          activeOpacity={0.85}
        >
          <Text style={styles.crown}>👑</Text>
          <Text style={styles.label}>Go Premium</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 9999,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5A623',
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  pillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  crown: {
    fontSize: 13,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeBtn: {
    marginLeft: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
});
