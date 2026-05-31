
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

export const PROGRESS_CARD_WIDTH = Dimensions.get('window').width;
// photo row 320 + badge area ~80 + bottom padding
export const PROGRESS_CARD_HEIGHT = 420;

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
}

function resolveImageSource(source: string | number | ImageSourcePropType | undefined): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

const ShareableProgressCard = forwardRef<ShareableProgressCardHandle, ShareableProgressCardProps>(
  function ShareableProgressCard(
    { beforePhoto, afterPhoto, leaderboardPhrase },
    ref
  ) {
    const viewShotRef = useRef<any>(null);
    const [beforeLoaded, setBeforeLoaded] = useState(false);
    const [afterLoaded, setAfterLoaded] = useState(false);

    const hasLeaderboard = !!leaderboardPhrase;

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
            const photosReady = beforeLoaded && afterLoaded;
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
    }), [beforeLoaded, afterLoaded]);

    return (
      <CaptureWrapper
        ref={viewShotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile' }}
        style={styles.captureWrapper}
      >
        <View style={styles.card}>
          {/* ── PHOTOS ROW ── */}
          <View style={styles.photoRow}>
            <View style={styles.photoContainer}>
              {!beforeLoaded && (
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
                  setBeforeLoaded(true);
                }}
              />
            </View>
            <View style={styles.photoContainer}>
              {!afterLoaded && (
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
                  setAfterLoaded(true);
                }}
              />
            </View>
          </View>

          {/* ── LEADERBOARD BADGE ── */}
          {hasLeaderboard && (
            <View style={styles.badgeContainer}>
              <View style={styles.leaderboardBadge}>
                <Text style={styles.leaderboardText}>{leaderboardPhrase}</Text>
              </View>
            </View>
          )}
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
    backgroundColor: '#0D0D0D',
    borderRadius: 20,
    overflow: 'hidden',
  },
  photoRow: {
    flexDirection: 'row',
    width: '100%',
    height: 320,
  },
  photoContainer: {
    width: '50%',
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
  badgeContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  leaderboardBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 50,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  leaderboardText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
