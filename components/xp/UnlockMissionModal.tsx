/**
 * UnlockMissionModal
 *
 * Bottom-sheet style modal that lets the user pick a mission to unlock for today.
 * Calls the unlock-mission-slot Edge Function on confirm.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import {
  Utensils,
  Dumbbell,
  Flame,
  Camera,
  Zap,
  Timer,
  MapPin,
  TrendingUp,
  X,
  ChevronRight,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { unlockMissionSlot } from '@/utils/xpApi';

// ─── Mission pool ─────────────────────────────────────────────────────────────

type PoolMission = {
  mission_type: string;
  title_key: string;
  xp: number;
  description_key: string;
  icon: string;
};

const UNLOCK_POOL: PoolMission[] = [
  { mission_type: 'log_three_meals',        title_key: 'xp.unlock_title_log_three_meals',           xp: 75,  description_key: 'xp.unlock_desc_log_three_meals',  icon: 'Utensils'    },
  { mission_type: 'complete_workout',        title_key: 'xp.unlock_title_complete_workout',           xp: 100, description_key: 'xp.unlock_desc_complete_workout',  icon: 'Dumbbell'    },
  { mission_type: 'keep_streak_alive',       title_key: 'xp.unlock_title_keep_streak_alive',          xp: 75,  description_key: 'xp.unlock_desc_keep_streak_alive', icon: 'Flame'       },
  { mission_type: 'log_weight_with_photo',   title_key: 'xp.unlock_title_log_weight_with_photo',      xp: 150, description_key: 'xp.unlock_desc_log_weight_with_photo', icon: 'Camera'  },
  { mission_type: 'burn_active_calories',    title_key: 'xp.unlock_title_burn_active_calories',       xp: 100, description_key: 'xp.unlock_desc_burn_active_calories', icon: 'Zap'     },
  { mission_type: 'burn_active_calories_hard', title_key: 'xp.unlock_title_burn_active_calories_hard', xp: 175, description_key: 'xp.unlock_desc_burn_active_calories_hard', icon: 'Zap' },
  { mission_type: 'exercise_minutes',        title_key: 'xp.unlock_title_exercise_minutes',           xp: 100, description_key: 'xp.unlock_desc_exercise_minutes',  icon: 'Timer'       },
  { mission_type: 'exercise_minutes_hard',   title_key: 'xp.unlock_title_exercise_minutes_hard',      xp: 200, description_key: 'xp.unlock_desc_exercise_minutes_hard', icon: 'Timer'   },
  { mission_type: 'walk_distance_mile',      title_key: 'xp.unlock_title_walk_distance_mile',         xp: 75,  description_key: 'xp.unlock_desc_walk_distance_mile', icon: 'MapPin'    },
  { mission_type: 'walk_distance_3mile',     title_key: 'xp.unlock_title_walk_distance_3mile',        xp: 150, description_key: 'xp.unlock_desc_walk_distance_3mile', icon: 'MapPin'   },
  { mission_type: 'flights_climbed',         title_key: 'xp.unlock_title_flights_climbed',            xp: 75,  description_key: 'xp.unlock_desc_flights_climbed',   icon: 'TrendingUp'  },
];

// ─── Icon renderer ────────────────────────────────────────────────────────────

function MissionIcon({ name, color }: { name: string; color: string }) {
  const size = 20;
  switch (name) {
    case 'Utensils':    return <Utensils    size={size} color={color} />;
    case 'Dumbbell':    return <Dumbbell    size={size} color={color} />;
    case 'Flame':       return <Flame       size={size} color={color} />;
    case 'Camera':      return <Camera      size={size} color={color} />;
    case 'Zap':         return <Zap         size={size} color={color} />;
    case 'Timer':       return <Timer       size={size} color={color} />;
    case 'MapPin':      return <MapPin      size={size} color={color} />;
    case 'TrendingUp':  return <TrendingUp  size={size} color={color} />;
    default:            return <Zap         size={size} color={color} />;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  xpConfig?: Record<string, number>;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UnlockMissionModal({ visible, onClose, onUnlocked, xpConfig }: Props) {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [loading, setLoading] = useState(false);

  const bgColor      = isDark ? colors.cardDark : '#FFFFFF';
  const titleColor   = isDark ? '#F1F5F9' : '#2B2D42';
  const subtitleColor = isDark ? '#A0A2B8' : '#6B7280';
  const rowBg        = isDark ? '#2A2C42' : '#F8F9FB';
  const rowBorder    = isDark ? '#3A3C52' : '#E5E7EB';
  const iconBg       = isDark ? '#1E2035' : '#FFF4E6';

  function handleMissionPress(mission: PoolMission) {
    console.log('[UnlockMissionModal] Mission row tapped:', mission.mission_type);
    const resolvedXp = xpConfig?.[mission.mission_type] ?? mission.xp;
    const missionTitle = t(mission.title_key);
    const alertTitle = t('xp.unlockMissionAlertTitle');
    const alertMsg = t('xp.unlockMissionAlertMsg', { title: missionTitle, xp: resolvedXp });

    Alert.alert(alertTitle, alertMsg, [
      { text: t('common.cancel'), style: 'cancel', onPress: () => console.log('[UnlockMissionModal] Unlock cancelled') },
      {
        text: t('xp.unlock'),
        style: 'default',
        onPress: () => confirmUnlock(mission),
      },
    ]);
  }

  async function confirmUnlock(mission: PoolMission) {
    console.log('[UnlockMissionModal] Confirming unlock for:', mission.mission_type);
    setLoading(true);
    try {
      const result = await unlockMissionSlot(mission.mission_type);
      console.log('[UnlockMissionModal] Unlock success:', result);
      setLoading(false);
      onClose();
      onUnlocked();
      const missionTitle = t(mission.title_key);
      Alert.alert(
        t('xp.missionUnlockedTitle'),
        t('xp.missionUnlockedMsg', { title: missionTitle }),
        [{ text: t('xp.letsGo') }]
      );
    } catch (err: any) {
      console.error('[UnlockMissionModal] Unlock failed:', err?.message ?? err);
      setLoading(false);
      Alert.alert(
        t('xp.unlockFailedTitle'),
        err?.message ?? t('xp.unlockFailedMsg'),
        [{ text: t('common.ok') }]
      );
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        console.log('[UnlockMissionModal] Modal dismissed via back gesture');
        onClose();
      }}
    >
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        {/* ── Header ── */}
        <View style={[styles.header, { borderBottomColor: rowBorder }]}>
          <View style={styles.headerTextBlock}>
            <Text style={[styles.headerTitle, { color: titleColor }]}>
              {t('xp.chooseMissionTitle')}
            </Text>
            <Text style={[styles.headerSubtitle, { color: subtitleColor }]}>
              {t('xp.chooseMissionSubtitle')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: rowBg }]}
            onPress={() => {
              console.log('[UnlockMissionModal] Close button pressed');
              onClose();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={18} color={subtitleColor} />
          </TouchableOpacity>
        </View>

        {/* ── Mission list ── */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {UNLOCK_POOL.map((mission, index) => {
            const isLast = index === UNLOCK_POOL.length - 1;
            const resolvedXp = xpConfig?.[mission.mission_type] ?? mission.xp;
            const xpText = '+' + resolvedXp + ' XP';
            const missionTitle = t(mission.title_key);
            const missionDescription = t(mission.description_key);
            return (
              <TouchableOpacity
                key={mission.mission_type}
                style={[
                  styles.missionRow,
                  { backgroundColor: rowBg, borderColor: rowBorder },
                  !isLast && styles.missionRowGap,
                ]}
                onPress={() => handleMissionPress(mission)}
                activeOpacity={0.7}
              >
                <View style={[styles.missionIconCircle, { backgroundColor: iconBg }]}>
                  <MissionIcon name={mission.icon} color="#FFB547" />
                </View>
                <View style={styles.missionTextBlock}>
                  <Text style={[styles.missionTitle, { color: titleColor }]}>
                    {missionTitle}
                  </Text>
                  <View style={styles.missionMeta}>
                    <Text style={[styles.missionXp, { color: '#FFB547' }]}>
                      {xpText}
                    </Text>
                    <Text style={[styles.missionDot, { color: subtitleColor }]}>
                      {'·'}
                    </Text>
                    <Text style={[styles.missionDescription, { color: subtitleColor }]}>
                      {missionDescription}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={subtitleColor} />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Bottom action bar ── */}
        <View style={[styles.bottomBar, { borderTopColor: rowBorder, backgroundColor: bgColor }]}>
          <TouchableOpacity
            style={[styles.cancelButton, { backgroundColor: rowBg }]}
            onPress={() => {
              console.log('[UnlockMissionModal] Cancel button pressed');
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, { color: subtitleColor }]}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Loading overlay ── */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <View style={[styles.loadingBox, { backgroundColor: bgColor }]}>
              <ActivityIndicator size="large" color="#FFB547" />
              <Text style={[styles.loadingText, { color: titleColor }]}>
                {t('xp.unlockingMission')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  // ── List ────────────────────────────────────────────────────────────────────
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: 14,
    borderWidth: 1,
    gap: spacing.sm,
  },
  missionRowGap: {
    marginBottom: 10,
  },
  missionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionTextBlock: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  missionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  missionXp: {
    fontSize: 13,
    fontWeight: '700',
  },
  missionDot: {
    fontSize: 13,
  },
  missionDescription: {
    fontSize: 13,
    flex: 1,
  },
  // ── Bottom bar ───────────────────────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 32 : spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelButton: {
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // ── Loading overlay ──────────────────────────────────────────────────────────
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    borderRadius: borderRadius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    minWidth: 180,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
