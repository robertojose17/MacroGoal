
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/lib/supabase/client';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import BodyScrollView from '@/components/BodyScrollView';
import { IconSymbol } from '@/components/IconSymbol';

// ── Funnel definition ────────────────────────────────────────────────────────

interface FunnelRow {
  order: number;
  label: string;
  event: string;
  step?: number;
}

const FUNNEL_ROWS: FunnelRow[] = [
  { order: 1,  label: 'Pantalla de Signup',           event: 'app_opened' },
  { order: 2,  label: 'Cuenta creada exitosamente',   event: 'auth_signup_completed' },
  { order: 3,  label: 'Paso 0 — Lose your first 10 lbs', event: 'onboarding_step_viewed', step: 0 },
  { order: 4,  label: 'Paso 1 — Pain point',          event: 'onboarding_step_viewed', step: 1 },
  { order: 5,  label: 'Paso 2 — Transformación',      event: 'onboarding_step_viewed', step: 2 },
  { order: 6,  label: 'Paso 3 — Datos básicos',       event: 'onboarding_step_viewed', step: 3 },
  { order: 7,  label: 'Paso 4 — Medidas',             event: 'onboarding_step_viewed', step: 4 },
  { order: 8,  label: 'Paso 5 — Objetivo',            event: 'onboarding_step_viewed', step: 5 },
  { order: 9,  label: 'Paso 6 — Nivel de actividad',  event: 'onboarding_step_viewed', step: 6 },
  { order: 10, label: 'Paso 7 — Restricciones',       event: 'onboarding_step_viewed', step: 7 },
  { order: 11, label: 'Paso 8 — Estilo de comidas',   event: 'onboarding_step_viewed', step: 8 },
  { order: 12, label: 'Paso 9 — Tu plan listo',       event: 'onboarding_step_viewed', step: 9 },
  { order: 13, label: 'Paso 10 — Paywall visto',      event: 'onboarding_step_viewed', step: 10 },
  { order: 14, label: 'Paywall — Start Free Trial',   event: 'onboarding_paywall_start_trial' },
  { order: 15, label: 'Paywall — Skip',               event: 'onboarding_paywall_skip' },
  { order: 16, label: 'Primera comida logueada',      event: 'first_meal_logged' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDefaultFrom(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDefaultTo(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function OnboardingAnalyticsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [fromDate, setFromDate] = useState<Date>(getDefaultFrom);
  const [toDate, setToDate] = useState<Date>(getDefaultTo);

  // Date picker state
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to' | null>(null);
  const [pickerTempDate, setPickerTempDate] = useState<Date>(new Date());

  const [counts, setCounts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────

  const maxCount = counts.length > 0 ? Math.max(...counts, 1) : 1;
  const fromDisplay = formatDate(fromDate);
  const toDisplay = formatDate(toDate);

  // ── Query ───────────────────────────────────────────────────────────────

  const runQuery = useCallback(async () => {
    console.log('[OnboardingAnalytics] Apply button pressed — running funnel query');
    console.log('[OnboardingAnalytics] Date range:', fromDate.toISOString(), '→', toDate.toISOString());
    setLoading(true);
    try {
      const results = await Promise.all(
        FUNNEL_ROWS.map(async (row) => {
          let query = supabase
            .from('onboarding_events')
            .select('session_id')
            .eq('event', row.event)
            .gte('created_at', fromDate.toISOString())
            .lte('created_at', toDate.toISOString());

          if (row.step !== undefined) {
            query = query.eq('step', row.step);
          }

          const { data, error } = await query;

          if (error) {
            console.error(`[OnboardingAnalytics] Error querying row ${row.order} (${row.event}):`, error.message);
            return 0;
          }

          const uniqueCount = new Set((data ?? []).map((r: any) => r.session_id)).size;
          console.log(`[OnboardingAnalytics] Row ${row.order} "${row.label}": ${uniqueCount} unique sessions`);
          return uniqueCount;
        })
      );

      console.log('[OnboardingAnalytics] Funnel query complete. Counts:', results);
      setCounts(results);
      setHasLoaded(true);
    } catch (err) {
      console.error('[OnboardingAnalytics] Unexpected error running funnel query:', err);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // ── Date picker handlers ────────────────────────────────────────────────

  const openPicker = (target: 'from' | 'to') => {
    console.log(`[OnboardingAnalytics] Date picker opened for: ${target}`);
    setPickerTempDate(target === 'from' ? fromDate : toDate);
    setPickerTarget(target);
  };

  const handlePickerChange = (_event: any, date?: Date) => {
    if (Platform.OS === 'android') {
      setPickerTarget(null);
      if (date) {
        applyPickerDate(date);
      }
    } else {
      if (date) {
        setPickerTempDate(date);
      }
    }
  };

  const applyPickerDate = (date: Date) => {
    if (pickerTarget === 'from') {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      console.log('[OnboardingAnalytics] From date selected:', d.toISOString());
      setFromDate(d);
    } else if (pickerTarget === 'to') {
      const d = new Date(date);
      d.setHours(23, 59, 59, 999);
      console.log('[OnboardingAnalytics] To date selected:', d.toISOString());
      setToDate(d);
    }
  };

  const confirmIOSPicker = () => {
    applyPickerDate(pickerTempDate);
    setPickerTarget(null);
  };

  const cancelPicker = () => {
    console.log('[OnboardingAnalytics] Date picker cancelled');
    setPickerTarget(null);
  };

  // ── Colors ──────────────────────────────────────────────────────────────

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[OnboardingAnalytics] Back button pressed');
            router.back();
          }}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={22}
            color={colors.primary}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          Onboarding Analytics
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <BodyScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Date Filter Card ─────────────────────────────────────────── */}
        <View style={[styles.filterCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.filterLabel, { color: textSecColor }]}>
            Date Range
          </Text>
          <View style={styles.dateRow}>
            {/* From */}
            <View style={styles.datePicker}>
              <Text style={[styles.datePickerLabel, { color: textSecColor }]}>
                From
              </Text>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: isDark ? colors.backgroundDark : '#F0F2F7', borderColor }]}
                onPress={() => openPicker('from')}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="calendar-today"
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.dateButtonText, { color: textColor }]}>
                  {fromDisplay}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.dateSeparator, { color: textSecColor }]}>
              →
            </Text>

            {/* To */}
            <View style={styles.datePicker}>
              <Text style={[styles.datePickerLabel, { color: textSecColor }]}>
                To
              </Text>
              <TouchableOpacity
                style={[styles.dateButton, { backgroundColor: isDark ? colors.backgroundDark : '#F0F2F7', borderColor }]}
                onPress={() => openPicker('to')}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="calendar-today"
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.dateButtonText, { color: textColor }]}>
                  {toDisplay}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Apply button */}
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={runQuery}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.applyButtonText}>
                Apply
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Funnel Table ─────────────────────────────────────────────── */}
        <View style={[styles.tableCard, { backgroundColor: cardBg, borderColor }]}>
          {/* Table Header */}
          <View style={[styles.tableHeader, { borderBottomColor: borderColor }]}>
            <Text style={[styles.colHash, { color: textSecColor }]}>
              #
            </Text>
            <Text style={[styles.colDesc, { color: textSecColor }]}>
              Descripción
            </Text>
            <Text style={[styles.colUsers, { color: textSecColor }]}>
              Usuarios
            </Text>
          </View>

          {/* Rows */}
          {FUNNEL_ROWS.map((row, index) => {
            const count = counts[index] ?? null;
            const barWidth = (hasLoaded && count !== null && maxCount > 0)
              ? (count / maxCount) * 100
              : 0;
            const isEven = index % 2 === 0;
            const rowBg = isEven
              ? (isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)')
              : 'transparent';
            const countDisplay = !hasLoaded ? '—' : count === 0 ? '—' : String(count);

            return (
              <View
                key={row.order}
                style={[styles.tableRow, { backgroundColor: rowBg, borderBottomColor: borderColor }]}
              >
                {/* Progress bar behind the row */}
                {hasLoaded && count !== null && count > 0 && (
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${barWidth}%` as any,
                        backgroundColor: colors.primary + '26',
                      },
                    ]}
                  />
                )}

                {/* Row content (above the bar) */}
                <Text style={[styles.colHash, { color: textSecColor }]}>
                  {row.order}
                </Text>
                <Text style={[styles.colDesc, { color: textColor }]} numberOfLines={2}>
                  {row.label}
                </Text>
                <Text style={[styles.colUsers, { color: count ? colors.primary : textSecColor, fontWeight: count ? '700' : '400' }]}>
                  {countDisplay}
                </Text>
              </View>
            );
          })}

          {/* Empty state */}
          {!hasLoaded && !loading && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateText, { color: textSecColor }]}>
                Select a date range and press Apply to load data.
              </Text>
            </View>
          )}

          {/* Loading overlay */}
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: textSecColor }]}>
                Loading funnel data...
              </Text>
            </View>
          )}
        </View>
      </BodyScrollView>

      {/* ── iOS Date Picker Modal ─────────────────────────────────────────── */}
      {Platform.OS === 'ios' && pickerTarget !== null && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={cancelPicker}
        >
          <TouchableOpacity
            style={styles.pickerOverlay}
            activeOpacity={1}
            onPress={cancelPicker}
          >
            <TouchableOpacity
              style={[styles.pickerSheet, { backgroundColor: cardBg }]}
              activeOpacity={1}
            >
              <View style={[styles.pickerSheetHeader, { borderBottomColor: borderColor }]}>
                <TouchableOpacity onPress={cancelPicker}>
                  <Text style={[styles.pickerAction, { color: textSecColor }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.pickerTitle, { color: textColor }]}>
                  {pickerTarget === 'from' ? 'From Date' : 'To Date'}
                </Text>
                <TouchableOpacity onPress={confirmIOSPicker}>
                  <Text style={[styles.pickerAction, { color: colors.primary }]}>
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerTempDate}
                mode="date"
                display="spinner"
                onChange={handlePickerChange}
                textColor={isDark ? colors.textDark : colors.text}
                maximumDate={new Date()}
              />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── Android Date Picker ───────────────────────────────────────────── */}
      {Platform.OS === 'android' && pickerTarget !== null && (
        <DateTimePicker
          value={pickerTarget === 'from' ? fromDate : toDate}
          mode="date"
          display="default"
          onChange={handlePickerChange}
          maximumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    padding: 4,
    marginRight: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
  },
  headerSpacer: {
    width: 30,
  },
  // Scroll
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  // Filter card
  filterCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.md,
  },
  filterLabel: {
    ...typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  datePicker: {
    flex: 1,
  },
  datePickerLabel: {
    ...typography.small,
    marginBottom: 4,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dateButtonText: {
    ...typography.caption,
    fontWeight: '500',
  },
  dateSeparator: {
    ...typography.body,
    paddingBottom: 10,
  },
  applyButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Table
  tableCard: {
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    overflow: 'hidden',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 0,
  },
  // Column widths
  colHash: {
    width: 28,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  colDesc: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    paddingRight: spacing.sm,
  },
  colUsers: {
    width: 56,
    fontSize: 14,
    textAlign: 'right',
  },
  // Empty / loading
  emptyState: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyStateText: {
    ...typography.caption,
    textAlign: 'center',
  },
  loadingOverlay: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.caption,
  },
  // iOS date picker sheet
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 32,
  },
  pickerSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: {
    ...typography.bodyBold,
  },
  pickerAction: {
    fontSize: 16,
    fontWeight: '500',
  },
});
