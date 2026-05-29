/**
 * XpShareCard
 *
 * Instagram Story-format (9:16) shareable card for the XP/Level system.
 * Captured via react-native-view-shot at 1080x1920 logical pixels.
 * Exposes a `captureWhenReady()` handle identical to ShareableProgressCard.
 */

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  ImageSourcePropType,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { rankColors } from '@/constants/Colors';

// react-native-view-shot — lazy import so Expo Go doesn't hang
let ViewShot: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { ViewShot = require('react-native-view-shot').default; } catch {}
}
const CaptureWrapper: any = ViewShot || View;

// ─── Logo asset ───────────────────────────────────────────────────────────────
// app.json icon: ./assets/images/72ae1849-bd62-45ba-89bf-c2232486e3a0.png
const APP_LOGO = require('../../assets/images/72ae1849-bd62-45ba-89bf-c2232486e3a0.png');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XpShareCardHandle {
  captureWhenReady: () => Promise<string>;
}

export interface XpShareCardProps {
  level: number;
  rank: string;
  totalXp: number;
  currentStreak: number;
  consistencyScore: number; // 0-100
  percentile: number;       // 0-100, where 92.5 means top 7.5%
  calorieDeficit?: number;  // 7-day calorie deficit (optional)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

/** e.g. percentile 92.5 → "8" (top 8%) */
function topPercent(percentile: number): string {
  const val = Math.max(1, Math.round(100 - percentile));
  return String(val);
}

// ─── Card dimensions ──────────────────────────────────────────────────────────
// Render at screen width, maintain 9:16 aspect ratio.
// ViewShot captures at this size; the parent scales it down for preview.
const CARD_WIDTH = Dimensions.get('window').width;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 16) / 9);

// ─── Component ────────────────────────────────────────────────────────────────

const XpShareCard = forwardRef<XpShareCardHandle, XpShareCardProps>(
  function XpShareCard(
    { level, rank, totalXp, currentStreak, consistencyScore, percentile, calorieDeficit },
    ref
  ) {
    const viewShotRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      captureWhenReady: (): Promise<string> => {
        console.log('[XpShareCard] captureWhenReady called');
        return new Promise((resolve, reject) => {
          // Small settle delay so layout is fully painted
          setTimeout(() => {
            if (!viewShotRef.current) {
              reject(new Error('[XpShareCard] ViewShot ref not available'));
              return;
            }
            console.log('[XpShareCard] Capturing...');
            viewShotRef.current
              .capture()
              .then((uri: string) => {
                console.log('[XpShareCard] Capture complete:', uri);
                resolve(uri);
              })
              .catch(reject);
          }, 250);
        });
      },
    }), []);

    const rankColor = rankColors[rank] ?? rankColors['Rookie'];
    const [gradStart, gradEnd] = rankColor.gradient;

    // Pre-compute display values (no logic in JSX)
    const levelDisplay = String(level);
    const rankDisplay = rank.toUpperCase();
    const streakDisplay = String(currentStreak);
    const consistencyDisplay = String(Math.round(consistencyScore));
    const topPercentDisplay = topPercent(percentile);
    const xpDisplay = Number(totalXp).toLocaleString();
    const showDeficit = (calorieDeficit ?? 0) > 0;
    const deficitDisplay = showDeficit ? Number(calorieDeficit).toLocaleString() : '';

    return (
      <CaptureWrapper
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}
        style={[styles.captureWrapper, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
      >
        {/* Full-bleed dark gradient with rank accent */}
        <LinearGradient
          colors={['#0D0F1E', '#12152A', '#0D0F1E']}
          style={styles.background}
        >
          {/* Rank glow overlay */}
          <View
            style={[
              styles.glowOverlay,
              { backgroundColor: rankColor.glow },
            ]}
            pointerEvents="none"
          />

          {/* Top accent bar */}
          <LinearGradient
            colors={[gradStart, gradEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topBar}
          />

          {/* ── CONTENT ── */}
          <View style={styles.content}>

            {/* Logo row */}
            <View style={styles.logoRow}>
              <Image
                source={resolveImageSource(APP_LOGO)}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.appName}>Macro Goal</Text>
            </View>

            {/* Spacer */}
            <View style={styles.spacerTop} />

            {/* LEVEL number — the hero element */}
            <Text style={styles.levelLabel}>LEVEL</Text>
            <Text
              style={[
                styles.levelNumber,
                {
                  color: '#F1F5F9',
                  textShadowColor: rankColor.glow,
                  textShadowRadius: 40,
                  textShadowOffset: { width: 0, height: 0 },
                },
              ]}
            >
              {levelDisplay}
            </Text>

            {/* Rank name */}
            <LinearGradient
              colors={[gradStart, gradEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rankPill}
            >
              <Text style={styles.rankText}>{rankDisplay}</Text>
            </LinearGradient>

            {/* Spacer */}
            <View style={styles.spacerMid} />

            {/* Stats row */}
            <View style={styles.statsRow}>
              {/* Streak */}
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>🔥</Text>
                <Text style={[styles.statValue, { color: rankColor.text }]}>
                  {streakDisplay}
                </Text>
                <Text style={styles.statLabel}>DAY STREAK</Text>
              </View>

              {/* Divider */}
              <View style={[styles.statDivider, { backgroundColor: rankColor.glow }]} />

              {/* Consistency */}
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>📊</Text>
                <Text style={[styles.statValue, { color: rankColor.text }]}>
                  {consistencyDisplay}
                  <Text style={styles.statUnit}>%</Text>
                </Text>
                <Text style={styles.statLabel}>CONSISTENCY</Text>
              </View>
            </View>

            {/* Top X% badge */}
            <View style={[styles.topBadge, { borderColor: rankColor.text }]}>
              <Text style={[styles.topBadgeText, { color: rankColor.text }]}>
                TOP
              </Text>
              <Text style={[styles.topBadgePercent, { color: rankColor.text }]}>
                {topPercentDisplay}%
              </Text>
              <Text style={[styles.topBadgeText, { color: rankColor.text }]}>
                OF ALL USERS
              </Text>
            </View>

            {/* XP total */}
            <View style={styles.xpRow}>
              <Text style={styles.xpValue}>{xpDisplay}</Text>
              <Text style={styles.xpLabel}> XP EARNED</Text>
            </View>

            {/* Calorie Deficit (7d) — only shown when provided */}
            {showDeficit && (
              <View style={styles.deficitRow}>
                <Text style={styles.deficitValue}>{deficitDisplay}</Text>
                <Text style={styles.deficitLabel}> CAL DEFICIT (7D)</Text>
              </View>
            )}

            {/* Divider */}
            <LinearGradient
              colors={[gradStart, gradEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.divider}
            />

            {/* CTA */}
            <Text style={styles.ctaText}>Join me on Macro Goal</Text>
            <Text style={[styles.ctaHandle, { color: rankColor.text }]}>@macrogoalapp</Text>

          </View>

          {/* Bottom accent bar */}
          <LinearGradient
            colors={[gradStart, gradEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.bottomBar}
          />
        </LinearGradient>
      </CaptureWrapper>
    );
  }
);

export default XpShareCard;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  captureWrapper: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  background: {
    flex: 1,
    position: 'relative',
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  topBar: {
    height: 4,
    width: '100%',
  },
  bottomBar: {
    height: 4,
    width: '100%',
  },
  content: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 32,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },
  spacerTop: {
    flex: 1,
    maxHeight: 40,
    minHeight: 20,
  },
  levelLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 6,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  levelNumber: {
    fontSize: 120,
    fontWeight: '900',
    lineHeight: 130,
    letterSpacing: -4,
  },
  rankPill: {
    borderRadius: 100,
    paddingHorizontal: 28,
    paddingVertical: 10,
    marginTop: 8,
  },
  rankText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  spacerMid: {
    flex: 1,
    maxHeight: 36,
    minHeight: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  statEmoji: {
    fontSize: 28,
  },
  statValue: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
  },
  statUnit: {
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.45)',
  },
  statDivider: {
    width: 1,
    height: 60,
    opacity: 0.4,
    marginHorizontal: 16,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 20,
  },
  topBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  topBadgePercent: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  xpValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: -1,
  },
  xpLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 2,
  },
  deficitRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  deficitValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: -0.5,
  },
  deficitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(52,211,153,0.6)',
    letterSpacing: 1.5,
  },
  divider: {
    width: 60,
    height: 2,
    borderRadius: 1,
    marginBottom: 20,
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 4,
  },
  ctaHandle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
