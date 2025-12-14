
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
  userName: string;
  disciplineScore: number;
  dateRange: string;
  caloriesConsumed: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fats: number;
  fatsGoal: number;
  fiber: number;
  fiberGoal: number;
  streakDays: number;
  proteinAccuracy: number;
  weightLost: number;
  leftPhotoUrl?: string;
  rightPhotoUrl?: string;
  leftPhotoDate?: string;
  rightPhotoDate?: string;
  onCapture?: (ref: React.RefObject<ViewShot>) => void;
}

export default function ShareableProgressCard({
  userName,
  disciplineScore,
  dateRange,
  caloriesConsumed,
  caloriesGoal,
  protein,
  proteinGoal,
  carbs,
  carbsGoal,
  fats,
  fatsGoal,
  fiber,
  fiberGoal,
  streakDays,
  proteinAccuracy,
  weightLost,
  leftPhotoUrl,
  rightPhotoUrl,
  leftPhotoDate,
  rightPhotoDate,
  onCapture,
}: ShareableProgressCardProps) {
  const viewShotRef = useRef<ViewShot>(null);

  // Expose the ref to parent component
  React.useEffect(() => {
    if (onCapture && viewShotRef.current) {
      onCapture(viewShotRef);
    }
  }, [onCapture]);

  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#10B981';
    if (score >= 80) return '#5CB97B';
    if (score >= 70) return '#5B9AA8';
    if (score >= 60) return '#F59E0B';
    return '#EF4444';
  };

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
      {/* Safe area container with padding */}
      <View style={styles.safeAreaContainer}>
        <LinearGradient
          colors={['#FAFBFC', '#F0F2F7', '#E8EBF2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* App Logo - Top Right Corner */}
          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/02b0be00-cc51-4a2d-b5ec-a2936df17daa.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          {/* User's Name - Prominent at Top */}
          <Text style={styles.userName}>{userName}&apos;s Journey</Text>

          {/* Consistency Score - Big, Bold, Visually Powerful */}
          <View style={styles.scoreSection}>
            <View
              style={[
                styles.scoreCircle,
                { 
                  borderColor: getScoreColor(disciplineScore),
                  boxShadow: `0px 12px 32px ${getScoreColor(disciplineScore)}40`,
                },
              ]}
            >
              <Text style={[styles.scoreValue, { color: getScoreColor(disciplineScore) }]}>
                {disciplineScore}
              </Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <Text style={styles.scoreLabel}>Consistency Score</Text>
          </View>

          {/* Progress Metrics - Clean, Minimal */}
          <View style={styles.metricsSection}>
            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>🔥</Text>
              <Text style={styles.metricValue}>{streakDays}</Text>
              <Text style={styles.metricLabel}>Day Streak</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>💪</Text>
              <Text style={styles.metricValue}>{proteinAccuracy}%</Text>
              <Text style={styles.metricLabel}>Protein Accuracy</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricEmoji}>⚖️</Text>
              <Text style={styles.metricValue}>-{weightLost.toFixed(1)}</Text>
              <Text style={styles.metricLabel}>lbs Lost</Text>
            </View>
          </View>

          {/* Bottom Tagline - Subtle */}
          <View style={styles.taglineSection}>
            <Text style={styles.tagline}>Track. Improve. Win.</Text>
            <Text style={styles.appName}>Macro Goal</Text>
          </View>
        </LinearGradient>
      </View>
    </ViewShot>
  );
}

const styles = StyleSheet.create({
  captureWrapper: {
    width: 1080,
    height: 1350,
    backgroundColor: '#FAFBFC',
  },
  safeAreaContainer: {
    width: 1080,
    height: 1350,
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    padding: 50,
    borderRadius: 32,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoContainer: {
    position: 'absolute',
    top: 40,
    right: 40,
    width: 60,
    height: 60,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.08)',
    elevation: 4,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1A1C2E',
    letterSpacing: -1,
    marginTop: 10,
    textAlign: 'center',
  },
  scoreSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 15,
  },
  scoreCircle: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    marginBottom: 16,
  },
  scoreValue: {
    fontSize: 100,
    fontWeight: '900',
    lineHeight: 100,
    letterSpacing: -3,
  },
  scoreOutOf: {
    fontSize: 28,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: -8,
  },
  scoreLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2B2D42',
    letterSpacing: 0.5,
  },
  metricsSection: {
    flexDirection: 'row',
    gap: 20,
    marginVertical: 20,
    width: '100%',
    justifyContent: 'center',
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.06)',
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  metricEmoji: {
    fontSize: 38,
    marginBottom: 10,
  },
  metricValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1A1C2E',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
  },
  taglineSection: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    width: '100%',
  },
  tagline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2B2D42',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#5B9AA8',
    letterSpacing: 1,
  },
});
