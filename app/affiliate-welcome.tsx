import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function AffiliateWelcomeScreen() {
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const handleApply = () => {
    console.log('[AffiliateWelcome] "Apply to Creator Program" button pressed');
    Linking.openURL('https://macro-goal.wwk.link/apply/default');
  };

  const handleDashboard = () => {
    console.log('[AffiliateWelcome] "Log in to Dashboard" button pressed');
    Linking.openURL('https://app.winwinkit.com/');
  };

  const handleGoToReferrals = () => {
    console.log('[AffiliateWelcome] "Go to Referral Dashboard" link pressed');
    router.replace('/referrals');
  };

  const iconStyle = {
    opacity: fadeAnim,
    transform: [{ scale: scaleAnim }],
  };

  return (
    <LinearGradient
      colors={['#0F0F0F', '#1A1A2E']}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.topSection}>
            <Animated.View style={iconStyle}>
              <Ionicons name="checkmark-circle" size={80} color="#FFB547" />
            </Animated.View>

            <Text style={styles.headline}>
              You're In! 🎉
            </Text>

            <Text style={styles.subheadline}>
              Start earning by referring friends to Macro Goal. Apply below or log in to track your earnings.
            </Text>
          </View>

          <View style={styles.buttonsSection}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleApply}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Apply to Creator Program</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.outlineButton}
              onPress={handleDashboard}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineButtonText}>Log in to Dashboard</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleGoToReferrals} style={styles.bottomLink}>
            <Text style={styles.bottomLinkText}>Go to Referral Dashboard →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  headline: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonsSection: {
    width: '100%',
    gap: 14,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#FFB547',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  primaryButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#FFB547',
  },
  outlineButtonText: {
    color: '#FFB547',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomLink: {
    paddingVertical: 8,
  },
  bottomLinkText: {
    color: '#14B8A6',
    fontSize: 14,
    textAlign: 'center',
  },
});
