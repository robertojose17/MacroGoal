
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────
type CoachMemory = {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  is_confirmed: boolean;
  is_blocked: boolean;
  times_referenced: number;
  last_referenced_at: string | null;
  created_at: string;
  updated_at: string;
};

type CoachMemorySettings = {
  user_id: string;
  memory_enabled: boolean;
  auto_infer: boolean;
  blocked_categories: string[];
  updated_at: string;
};

// ── Category display names ────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  food_preference: 'Food Preferences',
  disliked_food: 'Disliked Foods',
  meal_habit: 'Meal Habits',
  craving_pattern: 'Craving Patterns',
  satiety_food: 'Foods That Keep You Full',
  restaurant: 'Favorite Restaurants',
  store: 'Preferred Stores',
  schedule: 'Schedule & Routine',
  barrier: 'Common Barriers',
  strategy: 'Successful Strategies',
  motivation: 'Motivation',
  coaching_style: 'Coaching Style',
  budget: 'Budget',
  cooking_ability: 'Cooking Ability',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

function formatKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getSourceBadge(source: string, isConfirmed: boolean, t: (key: string) => string): { label: string; color: string; bg: string } {
  if (source === 'user_confirmed' || (source !== 'inferred' && isConfirmed)) {
    return { label: t('coachMemory.youEntered'), color: '#2563EB', bg: '#DBEAFE' };
  }
  if (isConfirmed) {
    return { label: t('coachMemory.confirmed'), color: '#059669', bg: '#D1FAE5' };
  }
  return { label: t('coachMemory.inferred'), color: '#6B7280', bg: '#F3F4F6' };
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return '#10B981';
  if (confidence >= 0.5) return '#F59E0B';
  return '#EF4444';
}

// ── Memory Item Component ─────────────────────────────────────────────────────
function MemoryItem({
  memory,
  isDark,
  onDelete,
  onUpdate,
  onConfirm,
  t,
}: {
  memory: CoachMemory;
  isDark: boolean;
  onDelete: (id: string) => void;
  onUpdate: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
  t: (key: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(memory.value);

  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? '#2A2C40' : '#FFFFFF';
  const borderColor = isDark ? colors.borderDark : colors.border;

  const sourceBadge = getSourceBadge(memory.source, memory.is_confirmed, t);
  const confidenceColor = getConfidenceColor(memory.confidence);
  const confidencePct = Math.round((memory.confidence ?? 0) * 100);
  const keyLabel = formatKey(memory.key);

  const handleSave = () => {
    console.log('[CoachMemory] Save memory value pressed, id:', memory.id, 'new value:', editValue.slice(0, 40));
    onUpdate(memory.id, editValue);
    setEditing(false);
  };

  const handleDeletePress = () => {
    console.log('[CoachMemory] Delete memory pressed, id:', memory.id, 'key:', memory.key);
    Alert.alert(
      t('coachMemory.deleteMemory'),
      t('coachMemory.confirmDelete'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            console.log('[CoachMemory] Delete confirmed, id:', memory.id);
            onDelete(memory.id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.memoryItem, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.memoryItemHeader}>
        <Text style={[styles.memoryKey, { color: textColor }]}>{keyLabel}</Text>
        <TouchableOpacity
          onPress={handleDeletePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteBtn}
        >
          <IconSymbol
            ios_icon_name="trash"
            android_material_icon_name="delete"
            size={15}
            color={colors.error}
          />
        </TouchableOpacity>
      </View>

      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={[styles.editInput, { color: textColor, borderColor, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
            value={editValue}
            onChangeText={setEditValue}
            autoFocus
            multiline
          />
          <View style={styles.editActions}>
            <TouchableOpacity
              style={[styles.editSaveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <Text style={styles.editSaveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editCancelBtn, { borderColor }]}
              onPress={() => {
                console.log('[CoachMemory] Edit cancelled, id:', memory.id);
                setEditing(false);
                setEditValue(memory.value);
              }}
            >
              <Text style={[styles.editCancelBtnText, { color: secondaryColor }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => {
            console.log('[CoachMemory] Edit memory tapped, id:', memory.id);
            setEditing(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.memoryValue, { color: secondaryColor }]}>{memory.value}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.memoryMeta}>
        <View style={[styles.sourceBadge, { backgroundColor: sourceBadge.bg }]}>
          <Text style={[styles.sourceBadgeText, { color: sourceBadge.color }]}>{sourceBadge.label}</Text>
        </View>

        {memory.source === 'inferred' && !memory.is_confirmed && (
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.success + '22', borderColor: colors.success + '44' }]}
            onPress={() => {
              console.log('[CoachMemory] Confirm memory pressed, id:', memory.id);
              onConfirm(memory.id);
            }}
          >
            <Text style={[styles.confirmBtnText, { color: colors.success }]}>{t('coachMemory.confirmQuestion')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.confidenceRow}>
        <Text style={[styles.confidenceLabel, { color: secondaryColor }]}>
          {t('coachMemory.confidence')}
        </Text>
        <View style={[styles.confidenceBarBg, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
          <View
            style={[
              styles.confidenceBarFill,
              { width: `${confidencePct}%` as any, backgroundColor: confidenceColor },
            ]}
          />
        </View>
        <Text style={[styles.confidencePct, { color: secondaryColor }]}>{confidencePct}%</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function CoachMemoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [memories, setMemories] = useState<CoachMemory[]>([]);
  const [settings, setSettings] = useState<CoachMemorySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    console.log('[CoachMemory] Fetching memories and settings');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[CoachMemory] No authenticated user');
        setLoading(false);
        return;
      }
      setUserId(user.id);

      const [memoriesRes, settingsRes] = await Promise.all([
        supabase
          .from('coach_memory')
          .select('*')
          .eq('user_id', user.id)
          .order('category', { ascending: true }),
        supabase
          .from('coach_memory_settings')
          .select('*')
          .eq('user_id', user.id)
          .single(),
      ]);

      console.log('[CoachMemory] Memories fetched:', memoriesRes.data?.length ?? 0);
      console.log('[CoachMemory] Settings fetched:', settingsRes.data ? 'yes' : 'none');

      if (memoriesRes.error) {
        console.error('[CoachMemory] Error fetching memories:', memoriesRes.error.message);
      } else {
        setMemories((memoriesRes.data as CoachMemory[]) ?? []);
      }

      if (settingsRes.error && settingsRes.error.code !== 'PGRST116') {
        console.error('[CoachMemory] Error fetching settings:', settingsRes.error.message);
      } else {
        setSettings(
          (settingsRes.data as CoachMemorySettings) ?? {
            user_id: user.id,
            memory_enabled: true,
            auto_infer: true,
            blocked_categories: [],
            updated_at: new Date().toISOString(),
          }
        );
      }
    } catch (e: any) {
      console.error('[CoachMemory] Unexpected error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    console.log('[CoachMemory] Screen mounted');
    fetchData();
  }, [fetchData]);

  // ── Toggle memory enabled ───────────────────────────────────────────────────
  const handleToggleMemory = useCallback(async () => {
    if (!userId || !settings) return;
    const newValue = !settings.memory_enabled;
    console.log('[CoachMemory] Toggle memory enabled:', newValue);
    setSettings((prev) => prev ? { ...prev, memory_enabled: newValue } : prev);
    const { error } = await supabase
      .from('coach_memory_settings')
      .upsert({ user_id: userId, memory_enabled: newValue });
    if (error) {
      console.error('[CoachMemory] Error toggling memory:', error.message);
      setSettings((prev) => prev ? { ...prev, memory_enabled: !newValue } : prev);
    }
  }, [userId, settings]);

  // ── Delete memory ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    console.log('[CoachMemory] Deleting memory id:', id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from('coach_memory').delete().eq('id', id);
    if (error) {
      console.error('[CoachMemory] Error deleting memory:', error.message);
      fetchData();
    }
  }, [fetchData]);

  // ── Update memory value ─────────────────────────────────────────────────────
  const handleUpdate = useCallback(async (id: string, value: string) => {
    console.log('[CoachMemory] Updating memory id:', id, 'value:', value.slice(0, 40));
    setMemories((prev) =>
      prev.map((m) => m.id === id ? { ...m, value, is_confirmed: true, source: 'user_confirmed' } : m)
    );
    const { error } = await supabase
      .from('coach_memory')
      .update({ value, is_confirmed: true, source: 'user_confirmed' })
      .eq('id', id);
    if (error) {
      console.error('[CoachMemory] Error updating memory:', error.message);
      fetchData();
    }
  }, [fetchData]);

  // ── Confirm memory ──────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async (id: string) => {
    console.log('[CoachMemory] Confirming memory id:', id);
    setMemories((prev) =>
      prev.map((m) => m.id === id ? { ...m, is_confirmed: true } : m)
    );
    const { error } = await supabase
      .from('coach_memory')
      .update({ is_confirmed: true })
      .eq('id', id);
    if (error) {
      console.error('[CoachMemory] Error confirming memory:', error.message);
    }
  }, []);

  // ── Block category ──────────────────────────────────────────────────────────
  const handleBlockCategory = useCallback(async (category: string) => {
    if (!userId || !settings) return;
    const current = settings.blocked_categories ?? [];
    if (current.includes(category)) return;
    const updated = [...current, category];
    console.log('[CoachMemory] Blocking category:', category);
    setSettings((prev) => prev ? { ...prev, blocked_categories: updated } : prev);
    const { error } = await supabase
      .from('coach_memory_settings')
      .upsert({ user_id: userId, blocked_categories: updated });
    if (error) {
      console.error('[CoachMemory] Error blocking category:', error.message);
      fetchData();
    }
  }, [userId, settings, fetchData]);

  // ── Unblock category ────────────────────────────────────────────────────────
  const handleUnblockCategory = useCallback(async (category: string) => {
    if (!userId || !settings) return;
    const updated = (settings.blocked_categories ?? []).filter((c) => c !== category);
    console.log('[CoachMemory] Unblocking category:', category);
    setSettings((prev) => prev ? { ...prev, blocked_categories: updated } : prev);
    const { error } = await supabase
      .from('coach_memory_settings')
      .upsert({ user_id: userId, blocked_categories: updated });
    if (error) {
      console.error('[CoachMemory] Error unblocking category:', error.message);
      fetchData();
    }
  }, [userId, settings, fetchData]);

  // ── Show block category picker ──────────────────────────────────────────────
  const handleShowBlockPicker = useCallback(() => {
    console.log('[CoachMemory] Block category picker opened');
    const blocked = settings?.blocked_categories ?? [];
    const available = ALL_CATEGORIES.filter((c) => !blocked.includes(c));
    if (available.length === 0) {
      Alert.alert(t('coachMemory.allCategoriesBlocked'));
      return;
    }
    const options = available.map((c) => CATEGORY_LABELS[c] ?? c);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options, t('common.cancel')], cancelButtonIndex: options.length, title: t('coachMemory.blockCategoryTitle') },
        (idx) => {
          if (idx < options.length) {
            handleBlockCategory(available[idx]);
          }
        }
      );
    } else {
      Alert.alert(
        t('coachMemory.blockCategoryTitle'),
        t('coachMemory.blockCategoryMessage'),
        [
          ...available.map((c) => ({
            text: CATEGORY_LABELS[c] ?? c,
            onPress: () => handleBlockCategory(c),
          })),
          { text: t('common.cancel'), style: 'cancel' as const },
        ]
      );
    }
  }, [settings, handleBlockCategory, t]);

  // ── Group memories by category ──────────────────────────────────────────────
  const grouped = React.useMemo(() => {
    const map: Record<string, CoachMemory[]> = {};
    for (const m of memories) {
      if (!map[m.category]) map[m.category] = [];
      map[m.category].push(m);
    }
    return map;
  }, [memories]);

  const categoryKeys = Object.keys(grouped).sort();
  const blockedCategories = settings?.blocked_categories ?? [];
  const memoryEnabled = settings?.memory_enabled ?? true;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>{t('coachMemory.title')}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[CoachMemory] Back button pressed');
            router.back();
          }}
          style={styles.backButton}
        >
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>{t('coachMemory.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Memory Toggle ── */}
        <View style={[styles.toggleCard, { backgroundColor: cardBg, borderColor }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <Text style={[styles.toggleTitle, { color: textColor }]}>{t('coachMemory.memoryEnabled')}</Text>
              <Text style={[styles.toggleSubtitle, { color: secondaryColor }]}>
                {t('coachMemory.memoryToggleDesc')}
              </Text>
            </View>
            <Switch
              value={memoryEnabled}
              onValueChange={handleToggleMemory}
              trackColor={{ false: colors.border, true: colors.primary + '80' }}
              thumbColor={memoryEnabled ? colors.primary : colors.disabled}
            />
          </View>
          {!memoryEnabled && (
            <View style={[styles.disabledBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}>
              <Text style={[styles.disabledBannerText, { color: colors.warning }]}>
                {t('coachMemory.memoryDisabled')}
              </Text>
            </View>
          )}
        </View>

        {/* ── Memory Categories ── */}
        {categoryKeys.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: cardBg, borderColor }]}>
            <Text style={styles.emptyStateEmoji}>🧠</Text>
            <Text style={[styles.emptyStateTitle, { color: textColor }]}>{t('coachMemory.noMemoriesYet')}</Text>
            <Text style={[styles.emptyStateSubtitle, { color: secondaryColor }]}>
              {t('coachMemory.startChatting')}
            </Text>
          </View>
        ) : (
          categoryKeys.map((category) => {
            const items = grouped[category];
            if (!items || items.length === 0) return null;
            const categoryLabel = CATEGORY_LABELS[category] ?? category;
            return (
              <View key={category} style={styles.categorySection}>
                <Text style={[styles.categoryLabel, { color: secondaryColor }]}>{categoryLabel}</Text>
                {items.map((memory) => (
                  <MemoryItem
                    key={memory.id}
                    memory={memory}
                    isDark={isDark}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                    onConfirm={handleConfirm}
                    t={t}
                  />
                ))}
              </View>
            );
          })
        )}

        {/* ── Blocked Categories ── */}
        <View style={styles.categorySection}>
          <Text style={[styles.categoryLabel, { color: secondaryColor }]}>{t('coachMemory.blockedCategories')}</Text>
          <View style={[styles.blockedCard, { backgroundColor: cardBg, borderColor }]}>
            {blockedCategories.length === 0 ? (
              <Text style={[styles.blockedEmpty, { color: secondaryColor }]}>
                {t('coachMemory.noBlockedCategories')}
              </Text>
            ) : (
              blockedCategories.map((cat) => {
                const label = CATEGORY_LABELS[cat] ?? cat;
                return (
                  <View key={cat} style={[styles.blockedRow, { borderBottomColor: borderColor }]}>
                    <Text style={[styles.blockedLabel, { color: textColor }]}>{label}</Text>
                    <TouchableOpacity
                      style={[styles.unblockBtn, { borderColor: colors.primary + '60' }]}
                      onPress={() => {
                        console.log('[CoachMemory] Unblock category pressed:', cat);
                        handleUnblockCategory(cat);
                      }}
                    >
                      <Text style={[styles.unblockBtnText, { color: colors.primary }]}>{t('coachMemory.unblock')}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
            <TouchableOpacity
              style={[styles.blockCategoryBtn, { borderColor: colors.error + '50' }]}
              onPress={handleShowBlockPicker}
            >
              <IconSymbol ios_icon_name="minus.circle" android_material_icon_name="block" size={15} color={colors.error} />
              <Text style={[styles.blockCategoryBtnText, { color: colors.error }]}>{t('coachMemory.blockCategory')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
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
    fontSize: 18,
  },
  headerRight: { width: 40 },
  // ── Scroll ──────────────────────────────────────────────────────────────────
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.md, gap: spacing.md },
  bottomPad: { height: spacing.xl },
  // ── Toggle card ─────────────────────────────────────────────────────────────
  toggleCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleTextCol: { flex: 1 },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 3,
  },
  toggleSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  disabledBanner: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    padding: spacing.sm,
  },
  disabledBannerText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyState: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyStateEmoji: { fontSize: 40 },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  // ── Category section ─────────────────────────────────────────────────────────
  categorySection: { gap: spacing.sm },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  // ── Memory item ──────────────────────────────────────────────────────────────
  memoryItem: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: 8,
  },
  memoryItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoryKey: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  memoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  sourceBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confirmBtn: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  confirmBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceLabel: {
    fontSize: 11,
    fontWeight: '500',
    width: 72,
  },
  confidenceBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceBarFill: {
    height: 4,
    borderRadius: 2,
  },
  confidencePct: {
    fontSize: 11,
    fontWeight: '600',
    width: 32,
    textAlign: 'right',
  },
  // ── Edit inline ──────────────────────────────────────────────────────────────
  editRow: { gap: 8 },
  editInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 40,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editSaveBtn: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  editSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  editCancelBtn: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  editCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // ── Blocked categories ───────────────────────────────────────────────────────
  blockedCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  blockedEmpty: {
    fontSize: 13,
    lineHeight: 18,
    padding: spacing.md,
  },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  blockedLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  unblockBtn: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unblockBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  blockCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  blockCategoryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
