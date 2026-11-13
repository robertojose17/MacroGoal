
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAcceptedGoalEditor } from '@/hooks/useAcceptedGoalEditor';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function CustomMacrosScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const editor = useAcceptedGoalEditor();
  const { loading, busy: saving } = editor;
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const number = (value: string) => value.trim() === '' ? NaN : Number(value);
  const proteinNum = number(protein), carbsNum = number(carbs), fatsNum = number(fats);
  const total = proteinNum + carbsNum + fatsNum;
  const totalDisplay = Math.round(total * 10) / 10;
  const isValid = [proteinNum, carbsNum, fatsNum].every(n => Number.isFinite(n) && n >= 0 && n <= 100) && Math.abs(total - 100) <= 0.5;
  useEffect(() => {
    const goal = editor.snapshot?.goal;
    if (!goal || !Number.isFinite(goal.daily_calories) || goal.daily_calories <= 0) return;
    setProtein(String(Math.round(goal.protein_g * 4 / goal.daily_calories * 100)));
    setCarbs(String(Math.round(goal.carbs_g * 4 / goal.daily_calories * 100)));
    setFats(String(Math.round(goal.fats_g * 9 / goal.daily_calories * 100)));
  }, [editor.snapshot]);
  const handleSave = async () => {
    const snapshot = editor.snapshot;
    if (!snapshot || !isValid || editor.pending || editor.busy) return;
    const calories = snapshot.goal.daily_calories;
    try {
      await editor.run('save', {
        userId: snapshot.profile.id, expectedProfileUpdatedAt: snapshot.profile.updated_at,
        expectedGoal: snapshot.goal, operation: 'manual_goal', profile: {},
        isCurrent: () => editor.isCurrent(snapshot.profile.id),
        goal: { daily_calories: calories, protein_g: Math.round(calories * proteinNum / 400),
          carbs_g: Math.round(calories * carbsNum / 400), fats_g: Math.round(calories * fatsNum / 900),
          fiber_g: snapshot.goal.fiber_g, macro_preset: 'custom' },
      });
      Alert.alert(t('customMacros.saved'), t('customMacros.savedMessage'));
    } catch (error) { Alert.alert(t('common.error'), error instanceof Error ? error.message : 'Unable to verify saved goals'); }
  };

  const bg = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textPrimary = isDark ? colors.textDark : colors.primaryText;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? colors.cardDark : '#FFFFFF';
  const inputBorder = isDark ? colors.borderDark : colors.border;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const totalColor = isValid ? colors.success : colors.error;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[CustomMacros] Back button pressed');
            router.back();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backText, { color: colors.accent }]}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>{t('customMacros.title')}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.subtitle, { color: textSecondary }]}>
          {t('customMacros.subtitle')}
        </Text>

        {/* Macro Inputs Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <MacroRow
            label={t('customMacros.protein')}
            color={colors.protein}
            value={protein}
            onChangeText={(v) => {
              console.log('[CustomMacros] Protein % changed:', v);
              setProtein(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          <MacroRow
            label={t('customMacros.carbs')}
            color={colors.carbs}
            value={carbs}
            onChangeText={(v) => {
              console.log('[CustomMacros] Carbs % changed:', v);
              setCarbs(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          <MacroRow
            label={t('customMacros.fats')}
            color={colors.fats}
            value={fats}
            onChangeText={(v) => {
              console.log('[CustomMacros] Fats % changed:', v);
              setFats(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        </View>

        {/* Total indicator */}
        <View style={[styles.totalRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.totalLabel, { color: textSecondary }]}>{t('customMacros.total')}</Text>
          <Text style={[styles.totalValue, { color: totalColor }]}>
            {totalDisplay}%
          </Text>
          {isValid ? (
            <Text style={[styles.totalBadge, { color: colors.success }]}>✓</Text>
          ) : (
            <Text style={[styles.totalBadge, { color: colors.error }]}>
              {total < 100 ? `${Math.round((100 - total) * 10) / 10}% short` : `${Math.round((total - 100) * 10) / 10}% over`}
            </Text>
          )}
        </View>

        {!!editor.error && <Text accessibilityRole="alert">{editor.error}</Text>}
        {editor.canRetrySave && <TouchableOpacity disabled={saving} onPress={() => { void editor.run('save').catch(() => {}); }}><Text>Retry the same save</Text></TouchableOpacity>}
        <TouchableOpacity disabled={saving} onPress={() => { void editor.review().catch(() => {}); }}><Text>Review current goals</Text></TouchableOpacity>
        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: isValid ? colors.accent : colors.disabled },
          ]}
          onPress={handleSave}
          disabled={!isValid || saving || editor.pending || !editor.snapshot}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface MacroRowProps {
  label: string;
  color: string;
  value: string;
  onChangeText: (v: string) => void;
  isDark: boolean;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  textSecondary: string;
}

function MacroRow({ label, color, value, onChangeText, inputBg, inputBorder, textPrimary, textSecondary }: MacroRowProps) {
  return (
    <View style={styles.macroRow}>
      <View style={[styles.macroColorDot, { backgroundColor: color }]} />
      <Text style={[styles.macroLabel, { color: textPrimary }]}>{label}</Text>
      <View style={styles.macroInputWrapper}>
        <TextInput
          style={[styles.macroInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          maxLength={5}
          placeholder="0"
          placeholderTextColor={textSecondary}
          selectTextOnFocus
        />
        <Text style={[styles.percentSign, { color: textSecondary }]}>%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 70,
  },
  backText: {
    ...typography.body,
  },
  headerTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  macroColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  macroLabel: {
    ...typography.bodyBold,
    flex: 1,
  },
  macroInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  macroInput: {
    width: 72,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  percentSign: {
    ...typography.bodyBold,
    width: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  totalLabel: {
    ...typography.bodyBold,
    flex: 1,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  totalBadge: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
