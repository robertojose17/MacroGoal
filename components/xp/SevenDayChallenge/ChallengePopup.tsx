/**
 * ChallengePopup
 *
 * Full-screen modal shown once after onboarding to invite the user to
 * accept the 7-Day Challenge. Matches the cinematic onboarding aesthetic.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = '#0A0A0A';
const GREEN = '#4CAF50';
const ACCENT = '#8EFF7A';
const GOLD = '#FFB547';
const MUTED = 'rgba(255,255,255,0.45)';

const CHALLENGE_SHOWN_KEY = 'seven_day_challenge_shown';

const DAYS = [
  { day: 1, label: 'Log your first meal' },
  { day: 2, label: 'Hit your calorie goal' },
  { day: 3, label: 'Hit your protein goal' },
  { day: 4, label: 'Walk 5,000 steps' },
  { day: 5, label: 'Log all 3 meals' },
  { day: 6, label: 'Complete a workout' },
  { day: 7, label: 'Hit all 3 goals 🏆' },
];

const PARTICLE_CONFIG = [
  { top: '8%', left: '12%', size: 5, duration: 3200, delay: 0, opacity: 0.4 },
  { top: '15%', left: '78%', size: 4, duration: 4100, delay: 600, opacity: 0.3 },
  { top: '28%', left: '88%', size: 6, duration: 3600, delay: 1200, opacity: 0.5 },
  { top: '45%', left: '6%', size: 4, duration: 4800, delay: 300, opacity: 0.35 },
  { top: '55%', left: '92%', size: 5, duration: 3900, delay: 900, opacity: 0.45 },
  { top: '68%', left: '18%', size: 4, duration: 4300, delay: 1500, opacity: 0.3 },
  { top: '78%', left: '72%', size: 6, duration: 3500, delay: 700, opacity: 0.5 },
  { top: '88%', left: '42%', size: 5, duration: 4600, delay: 400, opacity: 0.4 },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChallengePopupProps {
  visible: boolean;
  onClose: () => void;
  onAccepted: () => void;
  onAcceptChallenge: () => Promise<void>;
}

// ─── Floating Particles ───────────────────────────────────────────────────────

function FloatingParticles() {
  const anims = useRef(
    PARTICLE_CONFIG.map(() => ({
      translateY: new Animated.Value(0),
      opacity: new Animated.Value(0.3),
    }))
  ).current;

  useEffect(() => {
    anims.forEach((anim, i) => {
      const cfg = PARTICLE_CONFIG[i];
      const loopY = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.translateY, {
            toValue: -20,
            duration: cfg.duration,
            delay: cfg.delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 20,
            duration: cfg.duration,
            useNativeDriver: true,
          }),
        ])
      );
      const loopOp = Animated.loop(
        Animated.sequence([
          Animated.timing(anim.opacity, {
            toValue: cfg.opacity,
            duration: cfg.duration / 2,
            delay: cfg.delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.opacity, {
            toValue: 0.15,
            duration: cfg.duration / 2,
            useNativeDriver: true,
          }),
        ])
      );
      loopY.start();
      loopOp.start();
    });
  }, [anims]);

  return (
    <>
      {PARTICLE_CONFIG.map((cfg, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              top: cfg.top as string,
              left: cfg.left as string,
              width: cfg.size,
              height: cfg.size,
              borderRadius: cfg.size / 2,
              opacity: anims[i].opacity,
              transform: [{ translateY: anims[i].translateY }],
            },
          ]}
        />
      ))}
    </>
  );
}

// ─── Day Row ──────────────────────────────────────────────────────────────────

function DayRow({ day, label, anim }: { day: number; label: string; anim: Animated.Value }) {
  const dayText = 'Day ' + day;
  return (
    <Animated.View style={[styles.dayRow, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      <View style={styles.dayBadge}>
        <Text style={styles.dayBadgeText}>{dayText}</Text>
      </View>
      <Text style={styles.dayLabel}>{label}</Text>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChallengePopup({
  visible,
  onClose,
  onAccepted,
  onAcceptChallenge,
}: ChallengePopupProps) {
  const [accepting, setAccepting] = useState(false);

  // Staggered day row animations
  const dayAnims = useRef(DAYS.map(() => new Animated.Value(0))).current;
  const headerAnim = useRef(new Animated.Value(0)).current;
  const rewardAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    // Reset
    headerAnim.setValue(0);
    rewardAnim.setValue(0);
    buttonsAnim.setValue(0);
    dayAnims.forEach((a) => a.setValue(0));

    // Sequence: header → days (staggered) → reward pill → buttons
    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.stagger(
        100,
        dayAnims.map((a) =>
          Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true })
        )
      ),
      Animated.timing(rewardAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(buttonsAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleAccept = async () => {
    console.log('[ChallengePopup] Accept the Challenge pressed');
    setAccepting(true);
    try {
      await onAcceptChallenge();
      await AsyncStorage.setItem(CHALLENGE_SHOWN_KEY, 'true');
      console.log('[ChallengePopup] Challenge accepted — closing popup');
      onAccepted();
      onClose();
    } catch (err) {
      console.error('[ChallengePopup] acceptChallenge failed:', err);
      // Still close so user isn't stuck
      await AsyncStorage.setItem(CHALLENGE_SHOWN_KEY, 'true');
      onClose();
    } finally {
      setAccepting(false);
    }
  };

  const handleSkip = async () => {
    console.log('[ChallengePopup] Skip for now pressed');
    await AsyncStorage.setItem(CHALLENGE_SHOWN_KEY, 'true');
    onClose();
  };

  const titleOpacity = headerAnim;
  const subtitleOpacity = headerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay}>
        {/* Floating particles */}
        <FloatingParticles />

        {/* Content */}
        <View style={styles.content}>
          {/* Header */}
          <Animated.View style={[styles.headerBlock, { opacity: titleOpacity }]}>
            <Text style={styles.title}>
              {'Your 7-Day Challenge\nStarts Now.'}
            </Text>
            <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
              {'Most people quit in week 1. You won\'t.'}
            </Animated.Text>
          </Animated.View>

          {/* Day list */}
          <View style={styles.dayList}>
            {DAYS.map((item, i) => (
              <DayRow
                key={item.day}
                day={item.day}
                label={item.label}
                anim={dayAnims[i]}
              />
            ))}
          </View>

          {/* Reward pill */}
          <Animated.View style={[styles.rewardPill, { opacity: rewardAnim, transform: [{ scale: rewardAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
            <Text style={styles.rewardText}>
              {'🏅 +500 XP · Challenger Badge'}
            </Text>
          </Animated.View>

          {/* Buttons */}
          <Animated.View style={[styles.buttonsBlock, { opacity: buttonsAnim }]}>
            <TouchableOpacity
              style={[styles.acceptBtn, accepting && styles.acceptBtnDisabled]}
              onPress={handleAccept}
              activeOpacity={0.85}
              disabled={accepting}
            >
              {accepting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.acceptBtnText}>
                  {'Accept the Challenge 🔥'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              activeOpacity={0.7}
              disabled={accepting}
            >
              <Text style={styles.skipBtnText}>
                {'Skip for now'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  particle: {
    position: 'absolute',
    backgroundColor: ACCENT,
  },
  content: {
    width: '100%',
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  headerBlock: {
    marginBottom: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: MUTED,
    lineHeight: 22,
  },
  dayList: {
    marginBottom: 24,
    gap: 10,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dayBadge: {
    backgroundColor: 'rgba(76,175,80,0.18)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 48,
    alignItems: 'center',
  },
  dayBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.3,
  },
  dayLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    flex: 1,
  },
  rewardPill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,181,71,0.15)',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 28,
  },
  rewardText: {
    fontSize: 14,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 0.2,
  },
  buttonsBlock: {
    gap: 12,
  },
  acceptBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },
});
