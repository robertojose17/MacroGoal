import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremium } from '@/hooks/usePremium';

export default function GoPremiumFloatingBadge() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPremium } = usePremium();
  const [visible, setVisible] = useState(true);

  const handleDismiss = () => {
    console.log('[GoPremiumBadge] Dismissed by user');
    setVisible(false);
  };

  const handlePress = () => {
    console.log('[GoPremiumBadge] Tapped — navigating to /subscription');
    router.push('/subscription');
  };

  if (!visible || isPremium) return null;

  const TAB_BAR_HEIGHT = 80;
  const AD_BANNER_HEIGHT = 50;
  const bottomOffset = insets.bottom + TAB_BAR_HEIGHT + AD_BANNER_HEIGHT + 8;

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
