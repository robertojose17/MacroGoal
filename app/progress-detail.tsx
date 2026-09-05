
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import ProgressCard from '@/components/ProgressCard';
import { useProgressIntelligence, ProgressState } from '@/hooks/useProgressIntelligence';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDateES(isoDate: string): string {
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  const month = MONTHS_ES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function formatWeight(lbs: number | null): string {
  if (lbs == null) return '—';
  return `${Number(lbs).toFixed(1)} lbs`;
}

function formatTDEE(kcal: number): string {
  return Number(kcal).toLocaleString('es-MX') + ' kcal/día';
}

function formatPace(lbsPerWeek: number): string {
  const sign = lbsPerWeek > 0 ? '+' : '';
  return `${sign}${Number(lbsPerWeek).toFixed(2)} lbs/semana`;
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const CONFIDENCE_BG: Record<string, string> = {
  high: '#D1FAE5',
  medium: '#FEF3C7',
  low: '#FEE2E2',
};

const CONFIDENCE_TEXT: Record<string, string> = {
  high: '#065F46',
  medium: '#92400E',
  low: '#991B1B',
};

const CONFIDENCE_BG_DARK: Record<string, string> = {
  high: '#064E3B',
  medium: '#78350F',
  low: '#7F1D1D',
};

const CONFIDENCE_TEXT_DARK: Record<string, string> = {
  high: '#6EE7B7',
  medium: '#FCD34D',
  low: '#FCA5A5',
};

const STATUS_LABEL: Record<string, string> = {
  ON_TRACK: 'En camino',
  BELOW_TARGET_PACE: 'Por debajo del ritmo',
  ABOVE_TARGET_PACE: 'Por encima del ritmo',
  WEIGHT_STABLE: 'Peso estable',
  TRENDING_UP: 'Tendencia al alza',
  MAINTAINING: 'Manteniendo',
  GOAL_REACHED: '¡Meta alcanzada!',
};

const STATUS_BG: Record<string, string> = {
  ON_TRACK: '#D1FAE5',
  BELOW_TARGET_PACE: '#FEF3C7',
  ABOVE_TARGET_PACE: '#DBEAFE',
  WEIGHT_STABLE: '#F3F4F6',
  TRENDING_UP: '#FFEDD5',
  MAINTAINING: '#D1FAE5',
  GOAL_REACHED: '#D1FAE5',
};

const STATUS_TEXT: Record<string, string> = {
  ON_TRACK: '#065F46',
  BELOW_TARGET_PACE: '#92400E',
  ABOVE_TARGET_PACE: '#1E40AF',
  WEIGHT_STABLE: '#374151',
  TRENDING_UP: '#9A3412',
  MAINTAINING: '#065F46',
  GOAL_REACHED: '#065F46',
};

const STATUS_BG_DARK: Record<string, string> = {
  ON_TRACK: '#064E3B',
  BELOW_TARGET_PACE: '#78350F',
  ABOVE_TARGET_PACE: '#1E3A8A',
  WEIGHT_STABLE: '#374151',
  TRENDING_UP: '#7C2D12',
  MAINTAINING: '#064E3B',
  GOAL_REACHED: '#064E3B',
};

const STATUS_TEXT_DARK: Record<string, string> = {
  ON_TRACK: '#6EE7B7',
  BELOW_TARGET_PACE: '#FCD34D',
  ABOVE_TARGET_PACE: '#93C5FD',
  WEIGHT_STABLE: '#D1D5DB',
  TRENDING_UP: '#FDBA74',
  MAINTAINING: '#6EE7B7',
  GOAL_REACHED: '#6EE7B7',
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface SectionProps {
  isDark: boolean;
  progressState: ProgressState;
}

function JourneyProgressSection({ isDark, progressState }: SectionProps) {
  const jp = progressState.journeyProgress;
  if (jp.progressFraction == null) return null;

  const fraction = Math.min(1, Math.max(0, jp.progressFraction));
  const pct = Math.round(fraction * 100);
  const pctText = `${pct}% completado`;
  const barFill = `${pct}%`;

  const labelColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const barBg = isDark ? '#3A3C52' : '#E5E7EB';
  const barFillColor = colors.primary;

  const startText = formatWeight(jp.startWeightLbs);
  const currentText = formatWeight(jp.currentWeightLbs);
  const goalText = formatWeight(jp.goalWeightLbs);

  return (
    <View style={styles.subsection}>
      <Text style={[styles.subsectionTitle, { color: mutedColor }]}>Tu camino</Text>
      <View style={styles.journeyRow}>
        <View style={styles.journeyWeightItem}>
          <Text style={[styles.journeyWeightLabel, { color: mutedColor }]}>Inicio</Text>
          <Text style={[styles.journeyWeightValue, { color: labelColor }]}>{startText}</Text>
        </View>
        <View style={styles.journeyWeightItem}>
          <Text style={[styles.journeyWeightLabel, { color: mutedColor }]}>Actual</Text>
          <Text style={[styles.journeyWeightValue, { color: colors.primary }]}>{currentText}</Text>
        </View>
        <View style={styles.journeyWeightItem}>
          <Text style={[styles.journeyWeightLabel, { color: mutedColor }]}>Meta</Text>
          <Text style={[styles.journeyWeightValue, { color: labelColor }]}>{goalText}</Text>
        </View>
      </View>
      <View style={[styles.progressBarBg, { backgroundColor: barBg }]}>
        <View style={[styles.progressBarFill, { width: barFill as any, backgroundColor: barFillColor }]} />
      </View>
      <Text style={[styles.pctText, { color: mutedColor }]}>{pctText}</Text>
    </View>
  );
}

function ProjectionSection({ isDark, progressState }: SectionProps) {
  const proj = progressState.projection;
  if (proj.projectedGoalDate == null) return null;

  const primaryDate = formatDateES(proj.projectedGoalDate);
  const conf = proj.projectionConfidence ?? 'low';
  const confLabel = CONFIDENCE_LABEL[conf] ?? conf;
  const confBg = isDark ? (CONFIDENCE_BG_DARK[conf] ?? '#374151') : (CONFIDENCE_BG[conf] ?? '#F3F4F6');
  const confText = isDark ? (CONFIDENCE_TEXT_DARK[conf] ?? '#D1D5DB') : (CONFIDENCE_TEXT[conf] ?? '#374151');

  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const labelColor = isDark ? colors.textDark : colors.text;

  const hasRange = proj.projectedGoalDateRange != null;
  const rangeText = hasRange
    ? `Entre ${formatDateES(proj.projectedGoalDateRange!.earliest)} y ${formatDateES(proj.projectedGoalDateRange!.latest)}`
    : null;

  return (
    <View style={styles.subsection}>
      <View style={styles.subsectionHeader}>
        <Text style={[styles.subsectionTitle, { color: mutedColor }]}>Proyección de meta</Text>
        <View style={[styles.badge, { backgroundColor: confBg }]}>
          <Text style={[styles.badgeText, { color: confText }]}>{confLabel}</Text>
        </View>
      </View>
      <Text style={[styles.primaryValue, { color: labelColor }]}>{primaryDate}</Text>
      {rangeText != null && (
        <Text style={[styles.rangeText, { color: mutedColor }]}>{rangeText}</Text>
      )}
    </View>
  );
}

function TDEESection({ isDark, progressState }: SectionProps) {
  const tdee = progressState.tdee;
  if (tdee.value == null) return null;

  const isObserved = tdee.source === 'observed';
  const showGreenDot = isObserved && (tdee.confidence === 'medium' || tdee.confidence === 'high');
  const dotColor = showGreenDot ? '#10B981' : '#9CA3AF';
  const sourceLabel = isObserved ? 'Observado' : 'Estimado por fórmula';
  const sourceLabelColor = isObserved
    ? (isDark ? colors.textDark : colors.text)
    : (isDark ? colors.textSecondaryDark : colors.textSecondary);

  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const labelColor = isDark ? colors.textDark : colors.text;
  const tdeeText = formatTDEE(tdee.value);

  return (
    <View style={styles.subsection}>
      <Text style={[styles.subsectionTitle, { color: mutedColor }]}>Gasto calórico estimado</Text>
      <Text style={[styles.primaryValue, { color: labelColor }]}>{tdeeText}</Text>
      <View style={styles.sourceRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.sourceLabel, { color: sourceLabelColor }]}>{sourceLabel}</Text>
      </View>
    </View>
  );
}

function PaceSection({ isDark, progressState }: SectionProps) {
  const pace = progressState.weightPace;
  const status = progressState.progressStatus;

  if (pace.lbsPerWeek == null) return null;
  if (status === 'INSUFFICIENT_DATA') return null;

  const statusLabel = STATUS_LABEL[status] ?? status;
  const statusBg = isDark ? (STATUS_BG_DARK[status] ?? '#374151') : (STATUS_BG[status] ?? '#F3F4F6');
  const statusText = isDark ? (STATUS_TEXT_DARK[status] ?? '#D1D5DB') : (STATUS_TEXT[status] ?? '#374151');

  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const labelColor = isDark ? colors.textDark : colors.text;
  const paceText = formatPace(pace.lbsPerWeek);

  return (
    <View style={styles.subsection}>
      <View style={styles.subsectionHeader}>
        <Text style={[styles.subsectionTitle, { color: mutedColor }]}>Ritmo actual</Text>
        <View style={[styles.badge, { backgroundColor: statusBg }]}>
          <Text style={[styles.badgeText, { color: statusText }]}>{statusLabel}</Text>
        </View>
      </View>
      <Text style={[styles.primaryValue, { color: labelColor }]}>{paceText}</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ProgressDetailScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [userId, setUserId] = useState<string | null>(null);

  const { state: progressState, loading: pieLoading } = useProgressIntelligence();

  useEffect(() => {
    console.log('[ProgressDetailScreen] Mounted — fetching user');
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('[ProgressDetailScreen] User loaded:', user?.id ?? 'none');
      setUserId(user?.id ?? null);
    });
  }, []);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const dividerColor = isDark ? '#3A3C52' : '#E5E7EB';
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const labelColor = isDark ? colors.textDark : colors.text;

  // Determine whether to show the PIE section
  const showPIESection = progressState != null;
  const showPIEPlaceholder = pieLoading && progressState == null;

  // Check which subsections have data
  const hasJourney = progressState?.journeyProgress.progressFraction != null;
  const hasProjection = progressState?.projection.projectedGoalDate != null;
  const hasTDEE = progressState?.tdee.value != null;
  const hasPace = progressState?.weightPace.lbsPerWeek != null && progressState?.progressStatus !== 'INSUFFICIENT_DATA';
  const hasAnySubsection = hasJourney || hasProjection || hasTDEE || hasPace;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('progressDetail.title'),
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: bg },
          headerTitleStyle: { color: isDark ? colors.textDark : colors.text, fontWeight: '700' },
          headerTintColor: isDark ? colors.textDark : colors.text,
        }}
      />
      <SafeAreaView edges={['bottom']} style={[styles.safe, { backgroundColor: bg }]}>
        {userId ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            <ProgressCard userId={userId} isDark={isDark} layout="stacked" />

            {/* PIE placeholder — only on first load before any data arrives */}
            {showPIEPlaceholder && (
              <Text style={[styles.placeholder, { color: mutedColor }]}>
                Calculando progreso...
              </Text>
            )}

            {/* PIE section — only when data is available and has at least one subsection */}
            {showPIESection && hasAnySubsection && (
              <View style={[styles.pieCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.pieCardTitle, { color: labelColor }]}>
                  Inteligencia de Progreso
                </Text>

                {hasJourney && (
                  <>
                    <JourneyProgressSection isDark={isDark} progressState={progressState!} />
                    {(hasProjection || hasTDEE || hasPace) && (
                      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                    )}
                  </>
                )}

                {hasProjection && (
                  <>
                    <ProjectionSection isDark={isDark} progressState={progressState!} />
                    {(hasTDEE || hasPace) && (
                      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                    )}
                  </>
                )}

                {hasTDEE && (
                  <>
                    <TDEESection isDark={isDark} progressState={progressState!} />
                    {hasPace && (
                      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                    )}
                  </>
                )}

                {hasPace && (
                  <PaceSection isDark={isDark} progressState={progressState!} />
                )}
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  placeholder: {
    marginTop: spacing.md,
    fontSize: 14,
    textAlign: 'center',
  },

  // PIE card
  pieCard: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pieCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.md,
  },

  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },

  // Subsection shared
  subsection: {
    paddingVertical: spacing.xs,
  },
  subsectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subsectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  primaryValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 2,
  },

  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Journey progress
  journeyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  journeyWeightItem: {
    alignItems: 'center',
    flex: 1,
  },
  journeyWeightLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  journeyWeightValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  pctText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },

  // Projection
  rangeText: {
    fontSize: 13,
    marginTop: 2,
  },

  // TDEE
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  sourceLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
});
