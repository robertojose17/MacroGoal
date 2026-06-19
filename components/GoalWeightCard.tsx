import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';

const KG_TO_LBS = 2.20462;
const CHART_HEIGHT = 70;

interface GoalWeightCardProps {
  userId: string;
  isDark: boolean;
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
  startWeightKg?: number | null;
}

export default function GoalWeightCard({
  userId,
  isDark,
  currentWeightKg: propCurrent,
  goalWeightKg: propGoal,
  startWeightKg: propStart,
}: GoalWeightCardProps) {
  const router = useRouter();
  const [checkIns, setCheckIns] = useState<{ date: string; weight: number }[]>([]);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    console.log('[GoalWeightCard] fetching check-ins for userId:', userId);
    supabase
      .from('check_ins')
      .select('date, weight')
      .eq('user_id', userId)
      .not('weight', 'is', null)
      .order('date', { ascending: true })
      .limit(10)
      .then(({ data, error }) => {
        if (error) {
          console.log('[GoalWeightCard] check-ins fetch error:', error.message);
          return;
        }
        if (data) {
          const points = data
            .filter((c: any) => c.weight != null)
            .map((c: any) => ({ date: c.date, weight: Number(c.weight) }));
          console.log('[GoalWeightCard] loaded', points.length, 'weight check-ins');
          setCheckIns(points);
        }
      });
  }, [userId]);

  const bg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#F1F5F9' : '#111827';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const trackBg = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  // No goal set — show prompt immediately, no loading gate
  if (!propGoal) {
    return (
      <View style={[styles.card, { backgroundColor: bg }]}>
        <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
        <Text style={[styles.noGoal, { color: textSecondary }]}>
          Set your goal weight in Profile to track progress here.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            console.log('[GoalWeightCard] Set Goal Weight button pressed');
            router.push('/profile' as any);
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.btnText}>Set Goal Weight</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentKg = propCurrent ?? (checkIns.length > 0 ? checkIns[checkIns.length - 1].weight : null);
  if (!currentKg) return null;

  const startKg = propStart ?? (checkIns.length > 0 ? checkIns[0].weight : currentKg);
  const currentLbs = Math.round(currentKg * KG_TO_LBS);
  const goalLbs = Math.round(propGoal * KG_TO_LBS);

  const isLosing = propGoal < startKg;
  const totalRange = Math.abs(startKg - propGoal) || 1;
  const progress = Math.min(1, Math.max(0, Math.abs(startKg - currentKg) / totalRange));
  const isOnTrack = isLosing ? currentKg < startKg : currentKg > startKg;

  const firstDate = checkIns.length > 0 ? new Date(checkIns[0].date) : new Date();
  const weekNum = Math.max(1, Math.floor((Date.now() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);

  let estText = '';
  if (checkIns.length >= 2) {
    const first = checkIns[0];
    const last = checkIns[checkIns.length - 1];
    const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (24 * 60 * 60 * 1000));
    const rate = (first.weight - last.weight) / days;
    const remaining = currentKg - propGoal;
    if (rate > 0 && remaining > 0) {
      const est = new Date();
      est.setDate(est.getDate() + remaining / rate);
      estText = ' · Est. ' + est.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }
  }

  const hasChart = checkIns.length >= 2 && chartWidth > 0;
  let pts: { x: number; y: number }[] = [];

  if (hasChart) {
    const ws = checkIns.map((c) => c.weight);
    const minW = Math.min(...ws);
    const maxW = Math.max(...ws);
    const range = maxW - minW || 1;
    const pad = 8;
    pts = checkIns.map((c, i) => ({
      x: (i / (checkIns.length - 1)) * chartWidth,
      y:
        pad +
        ((isLosing ? c.weight - minW : maxW - c.weight) / range) *
          (CHART_HEIGHT - pad * 2),
    }));
  }

  const badgeBg = isOnTrack ? 'rgba(92,185,123,0.12)' : 'rgba(255,138,91,0.12)';
  const badgeColor = isOnTrack ? '#5CB97B' : '#FF8A5B';
  const badgeLabel = isOnTrack ? '✓ ON TRACK' : 'BEHIND';
  const progressPct = Math.round(progress * 100);
  const footerText = `Week ${weekNum} of journey${estText}`;

  return (
    <View style={[styles.card, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={styles.row}>
        <Text style={[styles.title, { color: textPrimary }]}>Goal Weight</Text>
        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{badgeLabel}</Text>
        </View>
      </View>

      {/* Chart */}
      <View
        style={[styles.chartArea, { height: CHART_HEIGHT }]}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
      >
        {hasChart &&
          pts.slice(0, -1).map((a, i) => {
            const b = pts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const cx = a.x + dx / 2;
            const cy = a.y + dy / 2;
            return (
              <View
                key={`seg-${i}`}
                style={{
                  position: 'absolute',
                  left: cx,
                  top: cy,
                  width: len,
                  height: 2,
                  marginLeft: -len / 2,
                  marginTop: -1,
                  backgroundColor: '#5B9AA8',
                  opacity: 0.8,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
        {hasChart &&
          pts.map((p, i) => (
            <View
              key={`dot-${i}`}
              style={{
                position: 'absolute',
                left: p.x - 3,
                top: p.y - 3,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: '#5B9AA8',
                opacity: i === pts.length - 1 ? 1 : 0.4,
              }}
            />
          ))}
        {!hasChart && (
          <View style={styles.noChartPlaceholder}>
            <Text style={[styles.noChartText, { color: textSecondary }]}>
              Log weight check-ins to see your trend
            </Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={[styles.track, { backgroundColor: trackBg }]}>
        <View style={[styles.fill, { width: `${progressPct}%` as any }]} />
        <View
          style={[
            styles.dot,
            { left: `${progressPct}%` as any, borderColor: bg },
          ]}
        />
      </View>

      {/* Weight labels */}
      <View style={styles.row}>
        <View>
          <Text style={[styles.weightNum, { color: textPrimary }]}>
            {currentLbs}{' '}
            <Text style={[styles.weightUnit, { color: textSecondary }]}>lbs</Text>
          </Text>
          <Text style={[styles.weightLabel, { color: textSecondary }]}>Current</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.weightNum, { color: textPrimary }]}>
            {goalLbs}{' '}
            <Text style={[styles.weightUnit, { color: textSecondary }]}>lbs</Text>
          </Text>
          <Text style={[styles.weightLabel, { color: textSecondary }]}>Goal</Text>
        </View>
      </View>

      {/* Footer */}
      <Text style={[styles.footer, { color: textSecondary }]}>{footerText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  chartArea: { marginBottom: 12, overflow: 'hidden' },
  noChartPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noChartText: { fontSize: 12 },
  track: {
    height: 6,
    borderRadius: 3,
    marginBottom: 10,
    overflow: 'visible',
    position: 'relative',
  },
  fill: { height: '100%', borderRadius: 3, backgroundColor: '#5B9AA8' },
  dot: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#5B9AA8',
    borderWidth: 2,
    marginLeft: -7,
  },
  weightNum: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  weightUnit: { fontSize: 13, fontWeight: '500' },
  weightLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  footer: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginTop: 8 },
  noGoal: { fontSize: 14, lineHeight: 20, marginVertical: 8 },
  btn: {
    backgroundColor: '#5B9AA8',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
