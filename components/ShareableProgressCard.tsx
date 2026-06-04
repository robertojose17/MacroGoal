
import React, { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Platform,
  ImageSourcePropType,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { colors } from '@/styles/commonStyles';

export const PROGRESS_CARD_WIDTH = Dimensions.get('window').width;
export const PROGRESS_CARD_HEIGHT = 640;

// react-native-view-shot requires a native build — lazy import so Expo Go doesn't hang
let ViewShot: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { ViewShot = require('react-native-view-shot').default; } catch {}
}
const CaptureWrapper: any = ViewShot || View;

export interface ShareableProgressCardHandle {
  captureWhenReady: () => Promise<string>;
}

export interface ShareableProgressCardProps {
  beforePhoto?: string | null;
  afterPhoto?: string | null;
  beforeDate?: string | null;
  afterDate?: string | null;
  beforeWeight?: number | null;
  afterWeight?: number | null;
  weightGoalProgress?: number;
  username?: string | null;
}

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const ShareableProgressCard = forwardRef<ShareableProgressCardHandle, ShareableProgressCardProps>(
  function ShareableProgressCard(
    { beforePhoto, afterPhoto, beforeDate, afterDate, beforeWeight, afterWeight, weightGoalProgress, username },
    ref
  ) {
    const viewShotRef = useRef<any>(null);

    // useState for visual placeholder re-renders
    const [beforeLoadedState, setBeforeLoadedState] = useState(false);
    const [afterLoadedState, setAfterLoadedState] = useState(false);

    // useRef for stale-closure-free capture polling
    const beforeLoadedRef = useRef(false);
    const afterLoadedRef = useRef(false);

    const clampedProgress = Math.max(0, Math.min(100, Math.round(weightGoalProgress ?? 0)));
    const progressPercent = `${clampedProgress}%`;
    const progressBarWidth = `${clampedProgress}%` as `${number}%`;

    const beforeDateDisplay = beforeDate || '';
    const afterDateDisplay = afterDate || 'Today';

    const showBeforeWeight = typeof beforeWeight === 'number' && isFinite(beforeWeight) && beforeWeight > 0;
    const showAfterWeight = typeof afterWeight === 'number' && isFinite(afterWeight) && afterWeight > 0;
    const beforeWeightDisplay = showBeforeWeight ? `${(beforeWeight as number).toFixed(1)} lbs` : '';
    const afterWeightDisplay = showAfterWeight ? `${(afterWeight as number).toFixed(1)} lbs` : '';

    const footerHandle = username ? `@${username}` : '@you';

    useImperativeHandle(ref, () => ({
      captureWhenReady: (): Promise<string> => {
        console.log('[ShareableProgressCard] captureWhenReady called');
        return new Promise((resolve, reject) => {
          const startTime = Date.now();
          const TIMEOUT_MS = 10_000;
          const POLL_INTERVAL_MS = 100;
          const SETTLE_DELAY_MS = 150;

          const poll = () => {
            const elapsed = Date.now() - startTime;
            const beforeReady = !beforePhoto || beforeLoadedRef.current;
            const afterReady = !afterPhoto || afterLoadedRef.current;
            const photosReady = beforeReady && afterReady;
            const timedOut = elapsed >= TIMEOUT_MS;

            if (photosReady || timedOut) {
              if (timedOut && !photosReady) {
                console.warn('[ShareableProgressCard] Timed out waiting for photos — capturing anyway');
              } else {
                console.log('[ShareableProgressCard] Photos ready, waiting settle delay...');
              }

              setTimeout(() => {
                if (!viewShotRef.current) {
                  reject(new Error('ViewShot ref not available'));
                  return;
                }
                console.log('[ShareableProgressCard] Capturing...');
                viewShotRef.current.capture().then((uri: string) => {
                  console.log('[ShareableProgressCard] Capture complete:', uri);
                  resolve(uri);
                }).catch(reject);
              }, SETTLE_DELAY_MS);
            } else {
              setTimeout(poll, POLL_INTERVAL_MS);
            }
          };

          poll();
        });
      },
    }), [beforePhoto, afterPhoto]);

    return (
      <CaptureWrapper
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={styles.captureWrapper}
      >
        <View style={styles.card}>

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Image
                source={require('@/assets/icon.png')}
                style={styles.appIcon}
                resizeMode="cover"
              />
              <Text style={styles.appName}>Macro Goal</Text>
            </View>
          </View>
          <View style={styles.headerDivider} />

          {/* ── PHOTOS ROW ── */}
          <View style={styles.photoRow}>
            {/* BEFORE */}
            <View style={styles.photoContainer}>
              {!beforeLoadedState && (
                <View style={styles.photoPlaceholder}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                </View>
              )}
              <Image
                source={resolveImageSource(beforePhoto)}
                style={styles.photo}
                resizeMode="cover"
                onLoad={() => {
                  console.log('[ShareableProgressCard] Before photo loaded');
                  beforeLoadedRef.current = true;
                  setBeforeLoadedState(true);
                }}
                onError={() => {
                  console.warn('[ShareableProgressCard] Before photo failed to load');
                  beforeLoadedRef.current = true;
                  setBeforeLoadedState(true);
                }}
              />
            </View>

            {/* Divider between photos */}
            <View style={styles.photoDivider} />

            {/* AFTER */}
            <View style={styles.photoContainer}>
              {!afterLoadedState && (
                <View style={styles.photoPlaceholder}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                </View>
              )}
              <Image
                source={resolveImageSource(afterPhoto)}
                style={styles.photo}
                resizeMode="cover"
                onLoad={() => {
                  console.log('[ShareableProgressCard] After photo loaded');
                  afterLoadedRef.current = true;
                  setAfterLoadedState(true);
                }}
                onError={() => {
                  console.warn('[ShareableProgressCard] After photo failed to load');
                  afterLoadedRef.current = true;
                  setAfterLoadedState(true);
                }}
              />
            </View>
          </View>

          {/* ── PHOTO CAPTIONS ROW ── */}
          <View style={styles.captionsRow}>
            {/* Before caption */}
            <View style={styles.captionColumn}>
              <Text style={styles.captionEyebrow}>BEFORE</Text>
              <Text style={styles.captionDate}>{beforeDateDisplay}</Text>
              {showBeforeWeight && (
                <Text style={styles.captionWeight}>{beforeWeightDisplay}</Text>
              )}
            </View>

            {/* After caption */}
            <View style={styles.captionColumn}>
              <Text style={styles.captionEyebrow}>AFTER</Text>
              <Text style={styles.captionDate}>{afterDateDisplay}</Text>
              {showAfterWeight && (
                <Text style={styles.captionWeight}>{afterWeightDisplay}</Text>
              )}
            </View>
          </View>

          {/* ── GOAL PROGRESS ── */}
          <View style={styles.goalDivider} />
          <View style={styles.goalBlock}>
            <Text style={styles.goalEyebrow}>GOAL PROGRESS</Text>
            <Text style={styles.goalPercent}>{progressPercent}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressBarWidth }]} />
            </View>
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

export default ShareableProgressCard;

const styles = StyleSheet.create({
  captureWrapper: {
    width: PROGRESS_CARD_WIDTH,
    height: PROGRESS_CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
  },
  card: {
    width: PROGRESS_CARD_WIDTH,
    height: PROGRESS_CARD_HEIGHT,
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  appIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // ── Photos ──────────────────────────────────────────────────────────────────
  photoRow: {
    flexDirection: 'row',
    width: '100%',
  },
  photoContainer: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#1A1A1A',
    overflow: 'hidden',
  },
  photoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    zIndex: 1,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  photoDivider: {
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },

  // ── Photo captions ──────────────────────────────────────────────────────────
  captionsRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  captionColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  captionEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
  captionDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  captionWeight: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },

  // ── Goal progress ────────────────────────────────────────────────────────────
  goalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  goalBlock: {
    paddingTop: 20,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  goalEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  goalPercent: {
    fontSize: 46,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 52,
    marginBottom: 12,
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.primary,
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
