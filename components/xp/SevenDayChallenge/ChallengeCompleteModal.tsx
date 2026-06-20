/**
 * ChallengeCompleteModal
 *
 * Full-screen celebration modal shown when the user completes all 7 days.
 * Reuses the cinematic onboarding aesthetic with floating particles and
 * a glass card.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  Share,
} from 'react-native';

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = '#0A0A0A';
const GREEN = '#4CAF50';
const ACCENT = '#8EFF7A';
const GOLD = '#FFB547';
const MUTED = 'rgba(255,255,255,0.5)';

const PARTICLE_CONFIG = [
  { top: '5%', left: '10%', size: 6, duration: 3200, delay: 0, opacity: 0.5 },
  { top: '12%', left: '80%', size: 4, duration: 4100, delay: 600, opacity: 0.35 },
  { top: '25%', left: '90%', size: 7, duration: 3600, delay: 1200, opacity: 0.55 },
  { top: '40%', left: '4%', size: 5, duration: 4800, delay: 300, opacity: 0.4 },
  { top: '60%', left: '94%', size: 4, duration: 3900, delay: 900, opacity: 0.45 },
  { top: '72%', left: '15%', size: 5, duration: 4300, delay: 1500, opacity: 0.35 },
  { top: '82%', left: '70%', size: 6, duration: 3500, delay: 700, opacity: 0.5 },
  { top: '90%', left: '45%', size: 4, duration: 4600, delay: 400, opacity: 0.4 },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChallengeCompleteModalProps {
  visible: boolean;
  onClose: () => void;
  xpConfig?: Record<string, number>;
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
            toValue: -22,
            duration: cfg.duration,
            delay: cfg.delay,
            useNativeDriver: true,
          }),
          Animated.timing(anim.translateY, {
            toValue: 22,
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
            toValue: 0.12,
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChallengeCompleteModal({
  visible,
  onClose,
  xpConfig,
}: ChallengeCompleteModalProps) {
  const challengeXp = xpConfig?.['seven_day_challenge'] ?? 500;
  const challengeXpText = '+' + challengeXp + ' XP earned';
  const medalScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    medalScale.setValue(0);
    contentOpacity.setValue(0);
    glowOpacity.setValue(0);

    Animated.sequence([
      // Medal springs in
      Animated.spring(medalScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      // Content fades in
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Glow pulses
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.6,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.2,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleShare = async () => {
    console.log('[ChallengeCompleteModal] Share my achievement pressed');
    try {
      await Share.share({
        message:
          "I just completed the 7-Day Challenge on Macro Goal! 🏅 Built a 7-day nutrition habit. #MacroGoal #7DayChallenge",
      });
    } catch (err) {
      console.error('[ChallengeCompleteModal] Share failed:', err);
    }
  };

  const handleContinue = () => {
    console.log('[ChallengeCompleteModal] Continue my journey pressed');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleContinue}
    >
      <View style={styles.overlay}>
        {/* Green glow behind medal */}
        <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

        {/* Floating particles */}
        <FloatingParticles />

        {/* Content */}
        <View style={styles.content}>
          {/* Medal */}
          <Animated.Text
            style={[styles.medal, { transform: [{ scale: medalScale }] }]}
          >
            {'🏅'}
          </Animated.Text>

          <Animated.View style={{ opacity: contentOpacity, alignItems: 'center', width: '100%' }}>
            {/* Title */}
            <Text style={styles.title}>
              {'Challenge Complete!'}
            </Text>
            <Text style={styles.subtitle}>
              {"You built a 7-day habit.\nThat's the hardest part."}
            </Text>

            {/* Glass badge card */}
            <View style={styles.glassCard}>
              <View style={styles.glassRow}>
                <Text style={styles.glassIcon}>{'🏅'}</Text>
                <View style={styles.glassTextBlock}>
                  <Text style={styles.glassTitle}>{'Challenger Badge'}</Text>
                  <Text style={styles.glassSubtitle}>{'Unlocked Forever ✓'}</Text>
                </View>
              </View>
            </View>

            {/* XP earned */}
            <Text style={styles.xpText}>
              {challengeXpText}
            </Text>

            {/* Buttons */}
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Text style={styles.shareBtnText}>
                {'Share my achievement'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleContinue}
              activeOpacity={0.7}
            >
              <Text style={styles.continueBtnText}>
                {'Continue my journey →'}
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
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: GREEN,
    top: '20%',
    alignSelf: 'center',
    // Blur-like effect via shadow
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 80,
    elevation: 0,
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
    alignItems: 'center',
  },
  medal: {
    fontSize: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 28,
  },
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 18,
    marginBottom: 20,
  },
  glassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  glassIcon: {
    fontSize: 32,
  },
  glassTextBlock: {
    flex: 1,
  },
  glassTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: GOLD,
    marginBottom: 2,
  },
  glassSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  xpText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
    marginBottom: 28,
  },
  shareBtn: {
    width: '100%',
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  continueBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  continueBtnText: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },
});
