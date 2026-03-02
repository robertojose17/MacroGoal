
import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';

interface ShareableProgressCardProps {
  consistencyScore: number;
  weightGoalProgress: number; // % complete (0-100)
  weightLost: number; // in lbs
  dayStreak: number;
  progressPhotoUrl?: string;
  beforePhotoUrl?: string;
  motivationalLine: string;
  onCapture?: (ref: React.RefObject<ViewShot>) => void;
}

export default function ShareableProgressCard({
  consistencyScore,
  weightGoalProgress,
  weightLost,
  dayStreak,
  progressPhotoUrl,
  beforePhotoUrl,
  onCapture,
}: ShareableProgressCardProps) {
  const viewShotRef = useRef<ViewShot>(null);

  // Expose the ref to parent component
  React.useEffect(() => {
    if (onCapture && viewShotRef.current) {
      onCapture(viewShotRef);
    }
  }, [onCapture]);

  // DEFENSIVE GUARDS: Ensure all numeric values are valid
  const safeConsistencyScore = isNaN(consistencyScore) || !isFinite(consistencyScore) ? 0 : Math.max(0, Math.min(100, Math.round(consistencyScore)));
  const safeWeightGoalProgress = isNaN(weightGoalProgress) || !isFinite(weightGoalProgress) ? 0 : Math.max(0, Math.min(100, Math.round(weightGoalProgress)));
  const safeWeightLost = isNaN(weightLost) || !isFinite(weightLost) ? 0 : Math.max(0, weightLost);
  const safeDayStreak = isNaN(dayStreak) || !isFinite(dayStreak) ? 0 : Math.max(0, Math.round(dayStreak));

  console.log('[ShareableProgressCard] === RENDERING WITH VALUES ===');
  console.log('[ShareableProgressCard] Consistency Score:', safeConsistencyScore);
  console.log('[ShareableProgressCard] Weight Goal Progress:', safeWeightGoalProgress, '%');
  console.log('[ShareableProgressCard] Weight Lost:', safeWeightLost, 'lb');
  console.log('[ShareableProgressCard] Day Streak:', safeDayStreak);

  return (
    <ViewShot
      ref={viewShotRef}
      options={{
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      }}
      style={styles.captureWrapper}
    >
      <LinearGradient
        colors={['#FFFFFF', '#F9FAFB', '#F3F4F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* SECTION 1 — TOP / HERO */}
        {/* Big number with explicit label "Consistency Score" */}
        <View style={styles.heroSection}>
          <Text style={styles.heroValue}>
            {safeConsistencyScore}
          </Text>
          <Text style={styles.heroLabel}>Consistency Score</Text>
        </View>

        {/* SECTION 2 — GOAL PROGRESS */}
        {/* Weight goal progress as simple text */}
        <View style={styles.progressTextSection}>
          <Text style={styles.progressText}>
            {safeWeightGoalProgress}% to weight goal
          </Text>
        </View>

        {/* SECTION 3 — RESULTS STRIP (ONE LINE) */}
        {/* Single horizontal line with stats */}
        <View style={styles.resultsStrip}>
          <Text style={styles.resultsText}>
            <Text style={styles.resultsBold}>–{safeWeightLost.toFixed(1)} lb</Text>
            <Text style={styles.resultsNormal}> lost</Text>
            <Text style={styles.resultsSeparator}> • </Text>
            <Text style={styles.resultsBold}>{safeDayStreak}-day</Text>
            <Text style={styles.resultsNormal}> streak </Text>
            <Text style={styles.resultsEmoji}>🔥</Text>
          </Text>
        </View>

        {/* SECTION 4 — TRANSFORMATION (KEEP AS IS) */}
        {/* Before → Now photos */}
        {(progressPhotoUrl || beforePhotoUrl) && (
          <View style={styles.photoSection}>
            {beforePhotoUrl && progressPhotoUrl ? (
              // Before → Now
              <View style={styles.photoRow}>
                <View style={styles.photoContainer}>
                  <Image
                    source={{ uri: beforePhotoUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoLabel}>Before</Text>
                </View>
                <View style={styles.photoArrow}>
                  <Text style={styles.photoArrowText}>→</Text>
                </View>
                <View style={styles.photoContainer}>
                  <Image
                    source={{ uri: progressPhotoUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  <Text style={styles.photoLabel}>Now</Text>
                </View>
              </View>
            ) : (
              // Single photo
              <View style={styles.singlePhotoContainer}>
                <Image
                  source={{ uri: progressPhotoUrl || beforePhotoUrl }}
                  style={styles.singlePhoto}
                  resizeMode="cover"
                />
              </View>
            )}
          </View>
        )}

        {/* SECTION 5 — FOOTER (OPTIONAL BUT CLEAN) */}
        {/* Subtle branding */}
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Macro Goal</Text>
          <Text style={styles.footerTagline}>Built with Macro Goal</Text>
        </View>
      </LinearGradient>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  captureWrapper: {
    width: 1080,
    height: 1920,
    backgroundColor: '#FFFFFF',
  },
  card: {
    width: 1080,
    height: 1920,
    padding: 60,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 140,
  },
  
  // SECTION 1 — TOP / HERO
  heroSection: {
    alignItems: 'center',
    marginBottom: 56,
  },
  heroValue: {
    fontSize: 320,
    fontWeight: '900',
    lineHeight: 320,
    letterSpacing: -16,
    color: '#5B9AA8',
  },
  heroLabel: {
    fontSize: 52,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 20,
    letterSpacing: 0.5,
  },

  // SECTION 2 — GOAL PROGRESS
  progressTextSection: {
    paddingHorizontal: 60,
    marginBottom: 48,
  },
  progressText: {
    fontSize: 36,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 48,
  },

  // SECTION 3 — RESULTS STRIP (ONE LINE)
  resultsStrip: {
    paddingHorizontal: 60,
    marginBottom: 64,
  },
  resultsText: {
    fontSize: 40,
    textAlign: 'center',
    lineHeight: 52,
  },
  resultsBold: {
    fontWeight: '900',
    color: '#1F2937',
  },
  resultsNormal: {
    fontWeight: '500',
    color: '#6B7280',
  },
  resultsSeparator: {
    fontWeight: '400',
    color: '#D1D5DB',
  },
  resultsEmoji: {
    fontSize: 40,
  },

  // SECTION 4 — TRANSFORMATION (EMOTIONAL ANCHOR)
  photoSection: {
    width: '100%',
    marginBottom: 56,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },
  photoContainer: {
    alignItems: 'center',
  },
  photo: {
    width: 420,
    height: 560,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.12)',
    elevation: 6,
  },
  photoLabel: {
    fontSize: 20,
    fontWeight: '400',
    color: '#9CA3AF',
    marginTop: 16,
  },
  photoArrow: {
    paddingHorizontal: 16,
  },
  photoArrowText: {
    fontSize: 40,
    fontWeight: '300',
    color: '#D1D5DB',
  },
  singlePhotoContainer: {
    alignItems: 'center',
  },
  singlePhoto: {
    width: 840,
    height: 560,
    borderRadius: 24,
    backgroundColor: '#E5E7EB',
    boxShadow: '0px 8px 28px rgba(0, 0, 0, 0.12)',
    elevation: 6,
  },

  // SECTION 5 — FOOTER (OPTIONAL BUT CLEAN)
  footer: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 40,
    paddingBottom: 60,
    width: '100%',
  },
  footerBrand: {
    fontSize: 40,
    fontWeight: '900',
    color: '#5B9AA8',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  footerTagline: {
    fontSize: 20,
    fontWeight: '500',
    color: '#9CA3AF',
    letterSpacing: 0.3,
  },
});
