
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
import { LinearGradient } from 'expo-linear-gradient';

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
  leaderboardPhrase?: string | null;
  weightLost?: number;
  dayStreak?: number;
  consistencyScore?: number;
}

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const ShareableProgressCard = forwardRef<ShareableProgressCardHandle, ShareableProgressCardProps>(
  function ShareableProgressCard(
    { beforePhoto, afterPhoto, beforeDate, afterDate, weightLost },
    ref
  ) {
    const viewShotRef = useRef<any>(null);

    // useState for visual placeholder re-renders
    const [beforeLoadedState, setBeforeLoadedState] = useState(false);
    const [afterLoadedState, setAfterLoadedState] = useState(false);

    // useRef for stale-closure-free capture polling
    const beforeLoadedRef = useRef(false);
    const afterLoadedRef = useRef(false);

    const weightLostNum = typeof weightLost === 'number' ? weightLost : 0;
    const showBigStat = weightLostNum > 0;
    const weightDisplay = `\u2212${weightLostNum.toFixed(1)} lbs`;

    const beforeDateDisplay = beforeDate || '';
    const afterDateDisplay = afterDate || 'Today';

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
            <Text style={styles.headerDots}>•••</Text>
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
              {/* Bottom vignette */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={styles.photoVignette}
                pointerEvents="none"
              />
              {/* BEFORE label top-left */}
              <View style={[styles.photoPill, styles.photoPillTopLeft, styles.photoPillLight]}>
                <Text style={styles.photoPillLightText}>BEFORE</Text>
              </View>
              {/* Date pill bottom-left */}
              <View style={[styles.photoPill, styles.photoPillBottomLeft, styles.photoPillDark]}>
                <Text style={styles.photoPillDarkText}>{beforeDateDisplay}</Text>
              </View>
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
              {/* Bottom vignette */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={styles.photoVignette}
                pointerEvents="none"
              />
              {/* AFTER label top-left */}
              <View style={[styles.photoPill, styles.photoPillTopLeft, styles.photoPillLight]}>
                <Text style={styles.photoPillLightText}>AFTER</Text>
              </View>
              {/* Date pill bottom-left */}
              <View style={[styles.photoPill, styles.photoPillBottomLeft, styles.photoPillDark]}>
                <Text style={styles.photoPillDarkText}>{afterDateDisplay}</Text>
              </View>
            </View>
          </View>

          {/* ── BIG STAT (only when weight has been lost) ── */}
          {showBigStat && (
            <>
              <LinearGradient
                colors={['rgba(91,154,168,0.08)', 'transparent']}
                style={styles.statsGlow}
                pointerEvents="none"
              />
              <View style={styles.bigStatContainer}>
                <Text style={styles.bigStatNumber}>{weightDisplay}</Text>
                <Text style={styles.bigStatCaption}>TOTAL LOST</Text>
              </View>
            </>
          )}

          {/* ── FOOTER ── */}
          <View style={[styles.footerDivider, showBigStat ? undefined : styles.footerDividerNoStat]} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>Join me on Macro Goal</Text>
          </View>

        </View>
      </CaptureWrapper>
    );
  }
);

export default ShareableProgressCard;

const PHOTO_ROW_HEIGHT = 340;

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
    justifyContent: 'space-between',
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
  headerDots: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    letterSpacing: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 0,
  },

  // ── Photos ──────────────────────────────────────────────────────────────────
  photoRow: {
    flexDirection: 'row',
    width: '100%',
    height: PHOTO_ROW_HEIGHT,
  },
  photoContainer: {
    flex: 1,
    height: '100%',
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
  photoVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    zIndex: 3,
  },
  photoDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 10,
  },
  photoPill: {
    position: 'absolute',
    borderRadius: 100,
    paddingHorizontal: 7,
    paddingVertical: 4,
    zIndex: 4,
  },
  photoPillTopLeft: {
    top: 10,
    left: 10,
  },
  photoPillBottomLeft: {
    bottom: 10,
    left: 10,
  },
  photoPillLight: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  photoPillLightText: {
    color: '#0D0D0D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  photoPillDark: {
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  photoPillDarkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Stats glow ───────────────────────────────────────────────────────────────
  statsGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PHOTO_ROW_HEIGHT + 1 + 51, // header height approx
    height: 200,
    zIndex: 0,
  },

  // ── Big stat ─────────────────────────────────────────────────────────────────
  bigStatContainer: {
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 4,
    zIndex: 1,
  },
  bigStatNumber: {
    fontSize: 56,
    fontWeight: '800',
    color: '#5CB97B',
    letterSpacing: -2,
    lineHeight: 62,
  },
  bigStatCaption: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footerDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 'auto',
    marginHorizontal: 0,
  },
  footerDividerNoStat: {
    marginTop: 'auto',
  },
  footer: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
  },
});
