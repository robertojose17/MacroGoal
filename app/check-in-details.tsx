
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

interface CheckIn {
  id: string;
  date: string;
  weight: number | null;
  steps: number | null;
  steps_goal: number | null;
  went_to_gym: boolean;
  photo_url: string | null;
  notes: string | null;
}

export default function CheckInDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const checkInId = params.checkInId as string;

  const [loading, setLoading] = useState(true);
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [user, setUser] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [checkInResult, authResult] = await Promise.all([
        supabase.from('check_ins').select('*').eq('id', checkInId).single(),
        supabase.auth.getUser(),
      ]);

      if (checkInResult.error) {
        console.error('[CheckInDetails] Error loading check-in:', checkInResult.error);
        Alert.alert(t('common.error'), t('checkInDetails.failedToLoad'));
        router.back();
        return;
      }

      const authUser = authResult.data.user;
      if (authUser) {
        const { data: userData } = await supabase
          .from('users')
          .select('preferred_units')
          .eq('id', authUser.id)
          .maybeSingle();
        setUser({ ...authUser, ...userData });
      }

      setCheckIn(checkInResult.data);
    } catch (error) {
      console.error('[CheckInDetails] Error in loadData:', error);
    } finally {
      setLoading(false);
    }
  }, [checkInId, router, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEdit = () => {
    if (!checkIn) return;
    console.log('[CheckInDetails] Edit button pressed for check-in:', checkIn.id);
    
    // Determine check-in type — check gym FIRST before steps
    let type: 'weight' | 'steps' | 'gym' = 'weight';
    if (checkIn.went_to_gym === true) type = 'gym';
    else if (checkIn.steps !== null) type = 'steps';
    
    router.push({
      pathname: '/check-in-form',
      params: { checkInId: checkIn.id, type },
    });
  };

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatWeight = (weight: number | null) => {
    if (weight === null || weight === undefined) return 'N/A';
    const units = user?.preferred_units || 'metric';
    console.log('[CheckInDetails] ⚖️ Formatting weight:', weight, 'kg, units:', units);
    
    if (units === 'imperial') {
      const lbs = Math.round(weight * 2.20462);
      console.log('[CheckInDetails] ⚖️ Converted to:', lbs, 'lbs');
      return `${lbs} lbs`;
    }
    return `${Math.round(weight)} kg`;
  };

  if (loading || !checkIn) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('common.loading')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const stepsGoalText = checkIn.steps_goal ? t('checkInDetails.stepsGoal', { goal: checkIn.steps_goal.toLocaleString() }) : null;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[CheckInDetails] Back button pressed');
            router.back();
          }}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          {t('checkInDetails.title')}
        </Text>
        <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={24}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Date */}
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.dateContainer}>
            <IconSymbol
              ios_icon_name="calendar"
              android_material_icon_name="calendar_today"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
              {formatDate(checkIn.date)}
            </Text>
          </View>
        </View>

        {/* Weight */}
        {checkIn.weight !== null && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <IconSymbol
                  ios_icon_name="scalemass"
                  android_material_icon_name="monitor_weight"
                  size={32}
                  color={colors.primary}
                />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {t('checkInDetails.weight')}
                </Text>
                <Text style={[styles.statValue, { color: isDark ? colors.textDark : colors.text }]}>
                  {formatWeight(checkIn.weight)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Steps */}
        {checkIn.steps !== null && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <IconSymbol
                  ios_icon_name="figure.walk"
                  android_material_icon_name="directions_walk"
                  size={32}
                  color={colors.primary}
                />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {t('checkInDetails.steps')}
                </Text>
                <Text style={[styles.statValue, { color: isDark ? colors.textDark : colors.text }]}>
                  {checkIn.steps.toLocaleString()}
                </Text>
                {stepsGoalText ? (
                  <Text style={[styles.statSubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {stepsGoalText}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {/* Gym */}
        {checkIn.went_to_gym && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.statRow}>
              <View style={styles.statIcon}>
                <IconSymbol
                  ios_icon_name="dumbbell.fill"
                  android_material_icon_name="fitness_center"
                  size={32}
                  color={colors.success}
                />
              </View>
              <View style={styles.statContent}>
                <Text style={[styles.statLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {t('checkInDetails.workout')}
                </Text>
                <Text style={[styles.statValue, { color: colors.success }]}>
                  {t('checkInDetails.completed')}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Photo */}
        {checkIn.photo_url && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {t('checkInDetails.photo')}
            </Text>
            <Image
              source={{ uri: checkIn.photo_url }}
              style={styles.photo}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Notes */}
        {checkIn.notes && (
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {t('checkInDetails.notes')}
            </Text>
            <Text style={[styles.notesText, { color: isDark ? colors.textDark : colors.text }]}>
              {checkIn.notes}
            </Text>
          </View>
        )}

        {/* Info message about deleting */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.info }]}>
          <IconSymbol
            ios_icon_name="info.circle"
            android_material_icon_name="info"
            size={20}
            color={colors.info}
          />
          <Text style={[styles.infoText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('checkInDetails.deleteInfo')}
          </Text>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
  },
  editButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateText: {
    ...typography.h3,
    fontSize: 18,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    ...typography.caption,
    marginBottom: 4,
  },
  statValue: {
    ...typography.h2,
    fontSize: 24,
  },
  statSubtext: {
    ...typography.caption,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.md,
  },
  photo: {
    width: '100%',
    height: 400,
    borderRadius: borderRadius.md,
  },
  notesText: {
    ...typography.body,
    lineHeight: 22,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
  },
  infoText: {
    ...typography.caption,
    flex: 1,
    fontSize: 13,
  },
  bottomSpacer: {
    height: 40,
  },
});
