/**
 * StreakBadgeModal
 *
 * Full-screen celebration modal for streak milestones (7, 30, 90, 365 days).
 * Reuses the same confetti approach as LevelUpModal.
 */

import React, { useEffect, useRef } from 'react';
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

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Confetti ─────────────────────────────────────────────────────────────────

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

// ─── Milestone config ─────────────────────────────────────────────────────────

interface MilestoneConfig {
  badgeName: string;
  gradientColors: [string, string];
  glowColor: string;
  isElite: boolean;
  isLegendary: boolean;
}

function getMilestoneConfig(streakDays: number): MilestoneConfig {
  if (streakDays >= 365) {
    return {
      badgeName: 'Year of Discipline',
      gradientColors: ['#FCD34D', '#D97706'],
      glowColor: 'rgba(252,211,77,0.6)',
      isElite: false,
      isLegendary: true,
    };
  }
  if (streakDays >= 90) {
    return {
      badgeName: 'Quarter King',
      gradientColors: ['#A78BFA', '#7C3AED'],
      glowColor: 'rgba(167,139,250,0.5)',
      isElite: true,
      isLegendary: false,
    };
  }
  if (streakDays >= 30) {
    return {
      badgeName: 'Monthly Master',
      gradientColors: ['#34D399', '#059669'],
      glowColor: 'rgba(52,211,153,0.4)',
      isElite: false,
      isLegendary: false,
    };
  }
  // 7 days
  return {
    badgeName: 'Week Warrior',
    gradientColors: ['#60A5FA', '#2563EB'],
    glowColor: 'rgba(96,165,250,0.4)',
    isElite: false,
    isLegendary: false,
  };
}

// ─── Pulse hook ───────────────────────────────────────────────────────────────

function usePulse(visible: boolean) {
  const scale = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.5);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  return { scale, opacity };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StreakBadgeModalProps {
  visible: boolean;
  streakDays: number;
  onDismiss: () => void;
}

export default function StreakBadgeModal({ visible, streakDays, onDismiss }: StreakBadgeModalProps) {
  const particles = useRef<Particle[]>(createParticles()).current;
  const { scale, opacity } = usePulse(visible);

  const config = getMilestoneConfig(streakDays);
  const streakDisplay = String(streakDays) + ' Day Streak!';

  useEffect(() => {
    if (visible) {
      console.log('[StreakBadgeModal] visible — firing confetti, streak:', streakDays);
      const t = setTimeout(() => fireConfetti(particles), 200);
      return () => clearTimeout(t);
    }
  }, [visible, streakDays, particles]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => {
          console.log('[StreakBadgeModal] dismissed — streak:', streakDays);
          onDismiss();
        }}
      >
        {/* Confetti */}
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
                    transform: [{ translateX: p.x }, { translateY: p.y }, { rotate }],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Card */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <LinearGradient
            colors={['#1E2035', '#252740']}
            style={[
              styles.card,
              {
                shadowColor: config.glowColor,
                shadowOpacity: 0.7,
                shadowRadius: config.isLegendary ? 32 : config.isElite ? 28 : 20,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            {/* Headline */}
            <Text style={[styles.headline, { color: config.gradientColors[0] }]}>
              STREAK MILESTONE
            </Text>

            {/* Flame with glow */}
            <Animated.Text
              style={[
                styles.flameEmoji,
                {
                  transform: [{ scale }],
                  opacity,
                  textShadowColor: config.glowColor,
                  textShadowRadius: config.isLegendary ? 30 : config.isElite ? 24 : 16,
                  textShadowOffset: { width: 0, height: 0 },
                },
              ]}
            >
              🔥
            </Animated.Text>

            {/* Streak count */}
            <Text
              style={[
                styles.streakText,
                {
                  color: '#F1F5F9',
                  textShadowColor: config.glowColor,
                  textShadowRadius: 16,
                  textShadowOffset: { width: 0, height: 0 },
                },
              ]}
            >
              {streakDisplay}
            </Text>

            {/* Badge name pill */}
            <LinearGradient
              colors={config.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.badgePill}
            >
              <Text style={styles.badgeName}>{config.badgeName}</Text>
            </LinearGradient>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: config.gradientColors[0] }]} />

            {/* Dismiss hint */}
            <Text style={styles.dismissHint}>Tap anywhere to continue</Text>
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
    marginBottom: 16,
  },
  flameEmoji: {
    fontSize: 72,
    lineHeight: 80,
    marginBottom: 8,
  },
  streakText: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 44,
    marginBottom: 20,
    textAlign: 'center',
  },
  badgePill: {
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginBottom: 20,
  },
  badgeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  divider: {
    width: 60,
    height: 2,
    borderRadius: 1,
    marginBottom: 16,
    opacity: 0.5,
  },
  dismissHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '400',
  },
});
