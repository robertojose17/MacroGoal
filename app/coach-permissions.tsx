
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

type PermissionLevel = 1 | 2 | 3 | 4;

type CoachPermissions = {
  id?: string;
  user_id?: string;
  permission_level: PermissionLevel;
  can_update_goals: boolean;
  can_add_food: boolean;
  can_create_meals: boolean;
  can_create_meal_plans: boolean;
  can_schedule_reminders: boolean;
  can_update_preferences: boolean;
  max_calorie_adjustment: number;
};

const DEFAULT_PERMISSIONS: CoachPermissions = {
  permission_level: 2,
  can_update_goals: false,
  can_add_food: false,
  can_create_meals: false,
  can_create_meal_plans: false,
  can_schedule_reminders: false,
  can_update_preferences: false,
  max_calorie_adjustment: 100,
};

type PermissionLevelDef = { level: PermissionLevel; titleKey: string; descKey: string };

const PERMISSION_LEVELS: PermissionLevelDef[] = [
  { level: 1, titleKey: 'coachPermissions.recommendOnly', descKey: 'coachPermissions.recommendOnlyDesc' },
  { level: 2, titleKey: 'coachPermissions.confirmEachAction', descKey: 'coachPermissions.confirmEachActionDesc' },
  { level: 3, titleKey: 'coachPermissions.limitedAuthorization', descKey: 'coachPermissions.limitedAuthorizationDesc' },
  { level: 4, titleKey: 'coachPermissions.autoCoaching', descKey: 'coachPermissions.autoCoachingDesc' },
];

type ToggleRow = {
  key: keyof CoachPermissions;
  labelKey: string;
  descKey: string;
};

const TOGGLE_ROWS: ToggleRow[] = [
  { key: 'can_update_goals', labelKey: 'coachPermissions.updateGoals', descKey: 'coachPermissions.updateGoalsDesc' },
  { key: 'can_add_food', labelKey: 'coachPermissions.addFoodToDiary', descKey: 'coachPermissions.addFoodToDiaryDesc' },
  { key: 'can_create_meals', labelKey: 'coachPermissions.createMeals', descKey: 'coachPermissions.createMealsDesc' },
  { key: 'can_create_meal_plans', labelKey: 'coachPermissions.createMealPlans', descKey: 'coachPermissions.createMealPlansDesc' },
  { key: 'can_schedule_reminders', labelKey: 'coachPermissions.scheduleReminders', descKey: 'coachPermissions.scheduleRemindersDesc' },
  { key: 'can_update_preferences', labelKey: 'coachPermissions.updatePreferences', descKey: 'coachPermissions.updatePreferencesDesc' },
];

export default function CoachPermissionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [permissions, setPermissions] = useState<CoachPermissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maxCalInput, setMaxCalInput] = useState('100');

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.borderDark : colors.border;

  const fetchPermissions = useCallback(async () => {
    console.log('[CoachPermissions] Fetching permissions from Supabase');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[CoachPermissions] No authenticated user');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('coach_permissions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('[CoachPermissions] Supabase error:', error.message);
      } else if (data) {
        console.log('[CoachPermissions] Loaded permissions, level:', data.permission_level);
        const loaded = data as CoachPermissions;
        setPermissions(loaded);
        setMaxCalInput(String(loaded.max_calorie_adjustment ?? 100));
      } else {
        console.log('[CoachPermissions] No permissions row found, using defaults');
      }
    } catch (e: any) {
      console.error('[CoachPermissions] Unexpected error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handleLevelSelect = useCallback((level: PermissionLevel) => {
    console.log('[CoachPermissions] Permission level selected:', level);
    setPermissions((prev) => ({ ...prev, permission_level: level }));
  }, []);

  const handleToggle = useCallback((key: keyof CoachPermissions, value: boolean) => {
    console.log('[CoachPermissions] Toggle changed:', key, '→', value);
    setPermissions((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    console.log('[CoachPermissions] Save button pressed, level:', permissions.permission_level);
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert(t('common.error'), t('common.loggedIn'));
        return;
      }

      const maxCal = parseInt(maxCalInput, 10);
      const payload: CoachPermissions = {
        ...permissions,
        user_id: user.id,
        max_calorie_adjustment: isNaN(maxCal) ? 100 : maxCal,
      };

      console.log('[CoachPermissions] Upserting permissions to Supabase');
      const { error } = await supabase
        .from('coach_permissions')
        .upsert(payload, { onConflict: 'user_id' });

      if (error) {
        console.error('[CoachPermissions] Save error:', error.message);
        Alert.alert(t('common.error'), t('coachPermissions.failedToSave'));
      } else {
        console.log('[CoachPermissions] Permissions saved successfully');
        Alert.alert(t('common.success'), t('coachPermissions.permissionsSaved'));
      }
    } catch (e: any) {
      console.error('[CoachPermissions] Save unexpected error:', e?.message);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
    } finally {
      setSaving(false);
    }
  }, [permissions, maxCalInput]);

  const handleRevokeAll = useCallback(() => {
    console.log('[CoachPermissions] Revoke all permissions button pressed');
    Alert.alert(
      t('coachPermissions.revokeAllTitle'),
      t('coachPermissions.revokeAllMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('coachPermissions.revokeAll'),
          style: 'destructive',
          onPress: async () => {
            console.log('[CoachPermissions] Revoking all permissions confirmed');
            const reset: CoachPermissions = {
              ...DEFAULT_PERMISSIONS,
              permission_level: 1,
            };
            setPermissions(reset);
            setMaxCalInput('100');

            setSaving(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;

              const { error } = await supabase
                .from('coach_permissions')
                .upsert({ ...reset, user_id: user.id }, { onConflict: 'user_id' });

              if (error) {
                console.error('[CoachPermissions] Revoke error:', error.message);
                Alert.alert(t('common.error'), t('coachPermissions.failedToRevoke'));
              } else {
                console.log('[CoachPermissions] All permissions revoked');
                Alert.alert(t('common.done'), t('coachPermissions.allRevoked'));
              }
            } catch (e: any) {
              console.error('[CoachPermissions] Revoke unexpected error:', e?.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, []);

  const showToggles = permissions.permission_level >= 3;
  const showMaxCal = permissions.permission_level === 4;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>{t('coachPermissions.title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[CoachPermissions] Back button pressed');
            router.back();
          }}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={textColor}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>
          {t('coachPermissions.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission Level */}
        <Text style={[styles.sectionLabel, { color: secondaryText }]}>
          {t('coachPermissions.permissionLevel').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          {PERMISSION_LEVELS.map((item, idx) => {
            const isSelected = permissions.permission_level === item.level;
            const isLast = idx === PERMISSION_LEVELS.length - 1;
            return (
              <TouchableOpacity
                key={item.level}
                style={[
                  styles.levelRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor },
                ]}
                onPress={() => handleLevelSelect(item.level)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.radioOuter,
                  { borderColor: isSelected ? colors.primary : borderColor },
                ]}>
                  {isSelected && (
                    <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />
                  )}
                </View>
                <View style={styles.levelTextWrap}>
                  <Text style={[styles.levelTitle, { color: textColor }]}>
                    {t(item.titleKey)}
                  </Text>
                  <Text style={[styles.levelDesc, { color: secondaryText }]}>
                    {t(item.descKey)}
                  </Text>
                </View>
                {isSelected && (
                  <View style={[styles.levelBadge, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.levelBadgeText, { color: colors.primary }]}>
                      {t('coachPermissions.active')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Toggles (Level 3+) */}
        {showToggles && (
          <>
            <Text style={[styles.sectionLabel, { color: secondaryText }]}>
              {t('coachPermissions.allowedActions').toUpperCase()}
            </Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              {TOGGLE_ROWS.map((row, idx) => {
                const isLast = idx === TOGGLE_ROWS.length - 1;
                const value = Boolean(permissions[row.key]);
                return (
                  <View
                    key={row.key}
                    style={[
                      styles.toggleRow,
                      !isLast && { borderBottomWidth: 1, borderBottomColor: borderColor },
                    ]}
                  >
                    <View style={styles.toggleTextWrap}>
                      <Text style={[styles.toggleLabel, { color: textColor }]}>
                        {t(row.labelKey)}
                      </Text>
                      <Text style={[styles.toggleDesc, { color: secondaryText }]}>
                        {t(row.descKey)}
                      </Text>
                    </View>
                    <Switch
                      value={value}
                      onValueChange={(v) => handleToggle(row.key, v)}
                      trackColor={{ false: borderColor, true: colors.primary + '80' }}
                      thumbColor={value ? colors.primary : (isDark ? '#888' : '#CCC')}
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Max calorie adjustment (Level 4 only) */}
        {showMaxCal && (
          <>
            <Text style={[styles.sectionLabel, { color: secondaryText }]}>
              {t('coachPermissions.autoCoachingLimits').toUpperCase()}
            </Text>
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.maxCalRow}>
                <View style={styles.maxCalTextWrap}>
                  <Text style={[styles.toggleLabel, { color: textColor }]}>
                    {t('coachPermissions.maxCalorieAdjustment')}
                  </Text>
                  <Text style={[styles.toggleDesc, { color: secondaryText }]}>
                    {t('coachPermissions.maxCalorieAdjustmentDesc')}
                  </Text>
                </View>
                <View style={[styles.maxCalInputWrap, { borderColor, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
                  <TextInput
                    style={[styles.maxCalInput, { color: textColor }]}
                    value={maxCalInput}
                    onChangeText={(t) => {
                      console.log('[CoachPermissions] Max calorie adjustment changed:', t);
                      setMaxCalInput(t.replace(/[^0-9]/g, ''));
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    selectTextOnFocus
                  />
                  <Text style={[styles.maxCalUnit, { color: secondaryText }]}>
                    {t('coachPermissions.calUnit')}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>
              {t('coachPermissions.savePermissions')}
            </Text>
          )}
        </TouchableOpacity>

        {/* Danger zone */}
        <Text style={[styles.sectionLabel, { color: secondaryText }]}>
          {t('coachPermissions.dangerZone').toUpperCase()}
        </Text>
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <TouchableOpacity
            style={styles.revokeRow}
            onPress={handleRevokeAll}
            activeOpacity={0.75}
          >
            <View style={[styles.revokeIconWrap, { backgroundColor: colors.error + '18' }]}>
              <IconSymbol
                ios_icon_name="xmark.shield"
                android_material_icon_name="block"
                size={20}
                color={colors.error}
              />
            </View>
            <View style={styles.revokeTextWrap}>
              <Text style={[styles.revokeTitle, { color: colors.error }]}>
                {t('coachPermissions.revokeAllPermissions')}
              </Text>
              <Text style={[styles.revokeDesc, { color: secondaryText }]}>
                {t('coachPermissions.revokeAllDesc')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 17,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  // Level selector
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  levelTextWrap: {
    flex: 1,
    gap: 2,
  },
  levelTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  levelDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  levelBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Toggles
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  toggleTextWrap: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  // Max cal
  maxCalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  maxCalTextWrap: {
    flex: 1,
    gap: 2,
  },
  maxCalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 4,
  },
  maxCalInput: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 48,
    textAlign: 'right',
  },
  maxCalUnit: {
    fontSize: 13,
  },
  // Save button
  saveBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  // Danger zone
  revokeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  revokeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  revokeTextWrap: {
    flex: 1,
    gap: 2,
  },
  revokeTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  revokeDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
});
