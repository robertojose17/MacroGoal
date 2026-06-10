/**
 * XpShareCard
 *
 * Instagram Story-format (9:16) shareable card for the XP/Level system.
 * Captured via react-native-view-shot at 1080x1920 logical pixels.
 * Exposes a `captureWhenReady()` handle identical to ShareableProgressCard.
 */

import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { getXpRank, formatRankFullLabel } from '@/utils/xpRanks';
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

// react-native-view-shot — lazy import so Expo Go doesn't hang
let ViewShot: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { ViewShot = require('react-native-view-shot').default; } catch {}
}
const CaptureWrapper: any = ViewShot || View;

// Fixed accent gradient for the share card
const CARD_GRAD_START = '#5B9AA8';
const CARD_GRAD_END = '#3A7A8A';
const CARD_GLOW = 'rgba(91,154,168,0.35)';
const CARD_ACCENT_TEXT = '#5B9AA8';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XpShareCardHandle {
  captureWhenReady: () => Promise<string>;
}

export interface XpShareCardProps {
  level: number;
  totalXp: number;
  currentStreak: number;
  consistencyScore: number; // 0-100
  percentile: number;       // 0-100, where 92.5 means top 7.5%
  calorieDeficit?: number;  // 7-day calorie deficit (optional)
  username?: string | null;
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
export const XP_CARD_WIDTH = Dimensions.get('window').width;
export const XP_CARD_HEIGHT = Math.round((XP_CARD_WIDTH * 16) / 9);
const CARD_WIDTH = XP_CARD_WIDTH;
const CARD_HEIGHT = XP_CARD_HEIGHT;

// ─── Component ────────────────────────────────────────────────────────────────

const XpShareCard = forwardRef<XpShareCardHandle, XpShareCardProps>(
  function XpShareCard(
    { level, totalXp, currentStreak, consistencyScore, percentile, calorieDeficit, username },
    ref
  ) {
    const viewShotRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      captureWhenReady: (): Promise<string> => {
        console.log('[XpShareCard] captureWhenReady called');
        return new Promise((resolve, reject) => {
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

    // Pre-compute display values (no logic in JSX)
    const rank = getXpRank(level);
    const rankNameDisplay = formatRankFullLabel(rank);
    const levelTextDisplay = 'Level ' + String(level);
    const streakDisplay = String(currentStreak);
    const consistencyDisplay = String(Math.round(consistencyScore));
    const topPercentDisplay = topPercent(percentile);
    const xpDisplay = Number(totalXp).toLocaleString();
    const showDeficit = (calorieDeficit ?? 0) > 0;
    const deficitDisplay = showDeficit ? Number(calorieDeficit).toLocaleString() : '';
    const footerHandle = username ? '@' + username : '@you';

    return (
      <CaptureWrapper
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1920 }}
        style={[styles.captureWrapper, { width: CARD_WIDTH, height: CARD_HEIGHT }]}
      >
        <View style={[styles.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]}>

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <Image
              source={resolveImageSource(require('@/assets/icon.png'))}
              style={styles.appIcon}
              resizeMode="cover"
            />
            <View style={styles.headerTextColumn}>
              <Text style={styles.appName}>Macro Goal</Text>
              <Text style={styles.appTagline}>
                Track. Improve. Transform.
              </Text>
            </View>
          </View>
          <View style={styles.headerDivider} />

          {/* ── CONTENT ── */}
          <View style={styles.content}>

            {/* Glow overlay */}
            <View
              style={[styles.glowOverlay, { backgroundColor: CARD_GLOW }]}
              pointerEvents="none"
            />

            {/* Spacer */}
            <View style={styles.spacerTop} />

            {/* RANK — the identity */}
            <Text
              style={[
                styles.rankName,
                {
                  color: rank.primaryColor,
                  textShadowColor: rank.primaryColor,
                  textShadowRadius: 30,
                  textShadowOffset: { width: 0, height: 0 },
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {rankNameDisplay}
            </Text>
            <Text style={[styles.levelSubtitle, { color: 'rgba(255,255,255,0.7)' }]}>
              {levelTextDisplay}
            </Text>

            {/* Streak display */}
            <View style={styles.streakDisplay}>
              <Text style={styles.streakFlame}>
                {'🔥'}
              </Text>
              <Text style={styles.streakNumber}>
                {streakDisplay}
              </Text>
              <Text style={styles.streakLabel}>
                Day Streak
              </Text>
            </View>

            {/* Spacer */}
            <View style={styles.spacerMid} />

            {/* Stats row */}
            <View style={styles.statsRow}>
              {/* Streak */}
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>🔥</Text>
                <Text style={[styles.statValue, { color: CARD_ACCENT_TEXT }]}>
                  {streakDisplay}
                </Text>
                <Text style={styles.statLabel}>DAY STREAK</Text>
              </View>

              {/* Divider */}
              <View style={[styles.statDivider, { backgroundColor: CARD_GLOW }]} />

              {/* Consistency */}
              <View style={styles.statBox}>
                <Text style={styles.statEmoji}>📊</Text>
                <Text style={[styles.statValue, { color: CARD_ACCENT_TEXT }]}>
                  {consistencyDisplay}
                  <Text style={styles.statUnit}>%</Text>
                </Text>
                <Text style={styles.statLabel}>CONSISTENCY</Text>
              </View>
            </View>

            {/* Top X% badge */}
            <View style={[styles.topBadge, { borderColor: CARD_ACCENT_TEXT }]}>
              <Text style={[styles.topBadgeText, { color: CARD_ACCENT_TEXT }]}>
                TOP
              </Text>
              <Text style={[styles.topBadgePercent, { color: CARD_ACCENT_TEXT }]}>
                {topPercentDisplay}%
              </Text>
              <Text style={[styles.topBadgeText, { color: CARD_ACCENT_TEXT }]}>
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

          </View>

          {/* ── FOOTER ── */}
          <View style={styles.footerDivider} />
          <View style={styles.footer}>
            <Text style={styles.footerHandle}>{footerHandle}</Text>
            <View style={styles.footerRight}>
              <Image
                source={require('@/assets/icon.png')}
                style={styles.footerIcon}
                resizeMode="cover"
              />
              <Text style={styles.footerBrand}>Made with Macro Goal</Text>
            </View>
          </View>

        </View>
      </CaptureWrapper>
    );
  }
);

export default XpShareCard;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  captureWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  appIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  headerTextColumn: {
    flexDirection: 'column',
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  appTagline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
    color: '#C9A84C',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 24,
    alignItems: 'center',
    position: 'relative',
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.08,
  },
  spacerTop: {
    flex: 1,
    maxHeight: 40,
    minHeight: 16,
  },
  rankName: {
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 72,
    letterSpacing: 2,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  levelSubtitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4,
    marginBottom: 8,
  },
  streakDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  streakFlame: {
    fontSize: 28,
  },
  streakNumber: {
    fontSize: 36,
    fontWeight: '900',
    color: '#F1F5F9',
    letterSpacing: -1,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    alignSelf: 'flex-end',
    marginBottom: 4,
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
    marginBottom: 16,
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

  // ── Footer ───────────────────────────────────────────────────────────────────
  footerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 'auto',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  footerHandle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  footerBrand: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
});
