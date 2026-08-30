
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
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

type ActionLog = {
  id: string;
  user_id: string;
  action_type: string;
  status: 'proposed' | 'confirmed' | 'rejected' | 'undone';
  proposed_at: string;
  confirmed_at: string | null;
  undone_at: string | null;
  target_table: string | null;
  target_id: string | null;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  data_evidence: unknown;
  expected_effect: string | null;
  is_reversible: boolean;
  confirmation_token: string | null;
  permission_level: number | null;
  authorized_by: string | null;
};

function formatActionType(actionType: string, t: (key: string) => string): string {
  const map: Record<string, string> = {
    update_goal: t('coachHistory.goalUpdate'),
    add_food_to_diary: t('coachHistory.addedFood'),
    create_meal: t('coachHistory.createdMeal'),
    create_meal_plan: t('coachHistory.mealPlanCreated'),
    schedule_reminder: t('coachHistory.reminderSet'),
    update_preferences: t('coachHistory.preferencesUpdated'),
  };
  const key = (actionType || '').toLowerCase().replace(/\s+/g, '_');
  if (map[key]) return map[key];
  // Fallback: title-case the action type
  return actionType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

type StatusConfig = {
  icon: string;
  color: string;
  label: string;
};

function getStatusConfig(status: string, t: (key: string) => string): StatusConfig {
  switch (status) {
    case 'confirmed':
      return { icon: '✓', color: '#10B981', label: t('coachHistory.confirmed') };
    case 'rejected':
      return { icon: '✗', color: colors.error, label: t('coachHistory.rejected') };
    case 'undone':
      return { icon: '↩', color: colors.textSecondary, label: t('coachHistory.undoneStatus') };
    case 'proposed':
    default:
      return { icon: '⏳', color: '#F59E0B', label: t('coachHistory.proposed') };
  }
}

function ActionLogItem({
  item,
  isDark,
  onUndo,
  t,
}: {
  item: ActionLog;
  isDark: boolean;
  onUndo: (id: string) => void;
  t: (key: string) => string;
}) {
  const statusConfig = getStatusConfig(item.status, t);
  const actionLabel = formatActionType(item.action_type, t);
  const dateText = formatDateTime(item.proposed_at);
  const canUndo = item.status === 'confirmed' && item.is_reversible;

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  return (
    <View style={[styles.itemCard, { backgroundColor: cardBg, borderColor }]}>
      <View style={styles.itemRow}>
        {/* Status icon */}
        <View style={[styles.statusIconWrap, { backgroundColor: statusConfig.color + '20' }]}>
          <Text style={[styles.statusIcon, { color: statusConfig.color }]}>
            {statusConfig.icon}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          <View style={styles.itemTitleRow}>
            <Text style={[styles.itemActionType, { color: textColor }]}>
              {actionLabel}
            </Text>
            <View style={[styles.itemStatusBadge, { backgroundColor: statusConfig.color + '18' }]}>
              <Text style={[styles.itemStatusText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
          </View>
          <Text style={[styles.itemDate, { color: secondaryText }]}>
            {dateText}
          </Text>
          {item.reason ? (
            <Text style={[styles.itemReason, { color: secondaryText }]} numberOfLines={2}>
              {item.reason}
            </Text>
          ) : null}
        </View>
      </View>

      {canUndo && (
        <TouchableOpacity
          style={[styles.undoBtn, { borderColor: colors.primary }]}
          onPress={() => {
            console.log('[CoachActionHistory] Undo button pressed for action:', item.id);
            onUndo(item.id);
          }}
          activeOpacity={0.75}
        >
          <Text style={[styles.undoBtnText, { color: colors.primary }]}>
            {t('coachHistory.undo')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function CoachActionHistoryScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const [actions, setActions] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    console.log('[CoachActionHistory] Fetching action log from Supabase');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('coach_action_log')
        .select('*')
        .order('proposed_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[CoachActionHistory] Supabase error:', error.message);
        Alert.alert(t('common.error'), t('coachHistory.failedToLoad'));
      } else {
        console.log('[CoachActionHistory] Loaded', data?.length ?? 0, 'actions');
        setActions((data as ActionLog[]) || []);
      }
    } catch (e: any) {
      console.error('[CoachActionHistory] Unexpected error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleUndo = useCallback(
    async (actionId: string) => {
      console.log('[CoachActionHistory] Undoing action:', actionId);
      setUndoingId(actionId);
      try {
        const { error } = await supabase.functions.invoke('ai-coach', {
          body: {
            messages: [
              {
                role: 'user',
                content: `Undo action ${actionId}`,
                timestamp: Date.now(),
              },
            ],
          },
        });

        if (error) {
          console.error('[CoachActionHistory] Undo error:', error.message);
          Alert.alert(t('common.error'), t('coachHistory.failedToUndo'));
        } else {
          console.log('[CoachActionHistory] Undo request sent for action:', actionId);
          Alert.alert(t('coachHistory.undoing'), t('coachHistory.undoRequested'));
          fetchActions();
        }
      } catch (e: any) {
        console.error('[CoachActionHistory] Undo unexpected error:', e?.message);
        Alert.alert(t('common.error'), t('common.unexpectedError'));
      } finally {
        setUndoingId(null);
      }
    },
    [fetchActions, t]
  );

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryText = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const borderColor = isDark ? colors.borderDark : colors.border;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => {
            console.log('[CoachActionHistory] Back button pressed');
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
          {t('coachHistory.title')}
        </Text>
        <TouchableOpacity
          onPress={() => {
            console.log('[CoachActionHistory] Refresh button pressed');
            fetchActions();
          }}
          style={styles.refreshButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol
            ios_icon_name="arrow.clockwise"
            android_material_icon_name="refresh"
            size={20}
            color={secondaryText}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: secondaryText }]}>
            {t('coachHistory.loadingHistory')}
          </Text>
        </View>
      ) : actions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🤖</Text>
          <Text style={[styles.emptyTitle, { color: textColor }]}>
            {t('coachHistory.noHistory')}
          </Text>
          <Text style={[styles.emptySubtitle, { color: secondaryText }]}>
            {t('coachHistory.coachHasntActed')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={actions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ActionLogItem
              item={item}
              isDark={isDark}
              onUndo={undoingId === item.id ? () => {} : handleUndo}
              t={t}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
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
    fontSize: 18,
  },
  refreshButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  itemCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  itemRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  statusIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  itemContent: {
    flex: 1,
    gap: 3,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemActionType: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  itemStatusBadge: {
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  itemStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 12,
  },
  itemReason: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  undoBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: 7,
    alignItems: 'center',
  },
  undoBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
