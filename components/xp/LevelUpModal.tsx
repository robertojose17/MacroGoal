/**
 * LevelUpModal
 *
 * Full-screen celebration modal shown when the user levels up.
 * Fires a confetti-style particle animation using React Native's Animated API.
 * On dismiss: calls confirmLevelUpSeen() to clear the pending flag.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { rankColors } from '@/constants/Colors';
import { confirmLevelUpSeen } from '@/utils/xpApi';
import RankBadge from './RankBadge';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Confetti particle ────────────────────────────────────────────────────────

const PARTICLE_COLORS = ['#FCD34D', '#34D399', '#60A5FA', '#F472B6', '#A78BFA', '#FB923C'];
const PARTICLE_COUNT = 30;

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  color: string;
  size: number;
  startX: number;
}

function createParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    opacity: new Animated.Value(1),
    rotate: new Animated.Value(0),
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    size: 6 + Math.random() * 8,
    startX: (Math.random() - 0.5) * SCREEN_W * 0.9,
  }));
}

function fireConfetti(particles: Particle[]) {
  const animations = particles.map((p) => {
    p.x.setValue(0);
    p.y.setValue(0);
    p.opacity.setValue(1);
    p.rotate.setValue(0);

    const targetX = p.startX;
    const targetY = -(SCREEN_H * 0.5 + Math.random() * SCREEN_H * 0.3);
    const duration = 1200 + Math.random() * 800;

    return Animated.parallel([
      Animated.timing(p.x, { toValue: targetX, duration, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(p.y, { toValue: targetY, duration: duration * 0.6, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: targetY * 0.3, duration: duration * 0.4, useNativeDriver: true }),
      ]),
      Animated.timing(p.rotate, { toValue: 720, duration, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(duration * 0.5),
        Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.5, useNativeDriver: true }),
      ]),
    ]);
  });

  Animated.stagger(30, animations).start();
}

// ─── Pulse animation for level number ────────────────────────────────────────

function usePulse() {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  return { scale, opacity };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LevelUpModalProps {
  visible: boolean;
  level: number;
  rank: string;
  pendingRankChange: string | null;
  onDismiss: () => void;
}

export default function LevelUpModal({
  visible,
  level,
  rank,
  pendingRankChange,
  onDismiss,
}: LevelUpModalProps) {
  const particles = useRef<Particle[]>(createParticles()).current;
  const { scale, opacity } = usePulse();
  const rankColor = rankColors[rank] ?? rankColors['Rookie'];

  const isRankChange = !!pendingRankChange;
  const headlineText = isRankChange ? 'NEW RANK UNLOCKED' : 'LEVEL UP!';
  const levelDisplay = 'Level ' + level;

  const handleDismiss = useCallback(async () => {
    console.log('[LevelUpModal] dismissed — confirming level up seen');
    try {
      await confirmLevelUpSeen();
    } catch (e) {
      console.warn('[LevelUpModal] confirmLevelUpSeen error (non-fatal):', e);
    }
    onDismiss();
  }, [onDismiss]);

  const handleSharePress = useCallback(() => {
    console.log('[LevelUpModal] Share My Progress pressed — navigating to share-progress?variant=level');
    // Dismiss modal first so it doesn't sit on top of the share screen
    handleDismiss().then(() => {
      router.push('/share-progress?variant=level');
    });
  }, [handleDismiss]);

  useEffect(() => {
    if (visible) {
      console.log('[LevelUpModal] visible — firing confetti, level:', level, 'rank:', rank);
      // Small delay so modal renders first
      const t = setTimeout(() => fireConfetti(particles), 200);
      return () => clearTimeout(t);
    }
  }, [visible, level, rank, particles]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={handleDismiss}
      >
        {/* Confetti particles */}
        <View style={styles.confettiContainer} pointerEvents="none">
          {particles.map((p, i) => {
            const rotate = p.rotate.interpolate({
              inputRange: [0, 720],
              outputRange: ['0deg', '720deg'],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.particle,
                  {
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                    opacity: p.opacity,
                    transform: [
                      { translateX: p.x },
                      { translateY: p.y },
                      { rotate },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Center card */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <LinearGradient
            colors={['#1E2035', '#252740']}
            style={[
              styles.card,
              {
                shadowColor: rankColor.glow,
                shadowOpacity: 0.6,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            {/* Headline */}
            <Text style={[styles.headline, { color: rankColor.text }]}>
              {headlineText}
            </Text>

            {/* Level number with pulse */}
            <Animated.Text
              style={[
                styles.levelText,
                {
                  transform: [{ scale }],
                  opacity,
                  color: '#F1F5F9',
                  textShadowColor: rankColor.glow,
                  textShadowRadius: 20,
                  textShadowOffset: { width: 0, height: 0 },
                },
              ]}
            >
              {levelDisplay}
            </Animated.Text>

            {/* Rank badge */}
            <View style={styles.rankRow}>
              <RankBadge rank={rank} size="lg" />
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: rankColor.glow }]} />

            {/* Share button */}
            <TouchableOpacity
              style={[styles.shareButton, { borderColor: rankColor.text }]}
              onPress={handleSharePress}
            >
              <Text style={[styles.shareButtonText, { color: rankColor.text }]}>
                Share My Progress
              </Text>
            </TouchableOpacity>

            {/* Dismiss hint */}
            <Text style={styles.dismissHint}>
              Tap anywhere to continue
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: SCREEN_H * 0.3,
  },
  particle: {
    position: 'absolute',
    borderRadius: 2,
  },
  card: {
    width: Math.min(SCREEN_W - 48, 360),
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  headline: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  levelText: {
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 72,
    marginBottom: 16,
  },
  rankRow: {
    marginBottom: 20,
  },
  divider: {
    width: 60,
    height: 2,
    borderRadius: 1,
    marginBottom: 20,
    opacity: 0.5,
  },
  shareButton: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dismissHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '400',
  },
});
