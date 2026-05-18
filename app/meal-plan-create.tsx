
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Modal, Platform,
  Keyboard, KeyboardEvent
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';

const formatDateForStorage = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateDisplay = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function MealPlanCreateScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 6);

  const [planName, setPlanName] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextWeek);
  const [pickerMode, setPickerMode] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => setKbHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKbHeight(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;

  const handlePickerChange = (_: any, date?: Date) => {
    if (!date) return;
    if (pickerMode === 'start') {
      setStartDate(date);
      if (date > endDate) {
        const newEnd = new Date(date);
        newEnd.setDate(date.getDate() + 6);
        setEndDate(newEnd);
      }
    } else if (pickerMode === 'end') {
      setEndDate(date);
    }
  };

  const pickerValue = pickerMode === 'start' ? startDate : endDate;
  const pickerMinDate = pickerMode === 'end' ? startDate : new Date();
  const durationDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) + 1);

  const handleCreate = async () => {
    console.log('[MealPlanCreate] Create Plan button pressed, name:', planName);
    if (!planName.trim()) {
      Alert.alert('Missing Name', 'Please enter a name for your meal plan.');
      return;
    }
    if (endDate < startDate) {
      Alert.alert('Invalid Dates', 'End date must be on or after start date.');
      return;
    }
    Keyboard.dismiss();
    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[MealPlanCreate] Auth error:', userError?.message);
        Alert.alert('Not Logged In', 'Please log in again to create a meal plan.');
        setSaving(false);
        return;
      }
      console.log('[MealPlanCreate] Creating meal plan for user:', user.id);
      const { data, error } = await supabase
        .from('meal_plans')
        .insert({
          user_id: user.id,
          name: planName.trim(),
          start_date: formatDateForStorage(startDate),
          end_date: formatDateForStorage(endDate),
        })
        .select()
        .single();
      if (error) {
        console.error('[MealPlanCreate] Supabase insert error:', error.message);
        Alert.alert('Error', error.message || 'Failed to create meal plan.');
        setSaving(false);
        return;
      }
      console.log('[MealPlanCreate] Meal plan created successfully, id:', data.id);
      router.replace({ pathname: '/meal-plan-detail', params: { planId: data.id } });
    } catch (err: any) {
      console.error('[MealPlanCreate] Unexpected error:', err?.message);
      Alert.alert('Error', err?.message || 'Unexpected error. Please try again.');
      setSaving(false);
    }
  };

  // The key: the outer View shrinks by kbHeight, pushing everything up
  return (
    <View style={{ flex: 1, backgroundColor: bgColor, paddingTop: insets.top, paddingBottom: kbHeight > 0 ? kbHeight : insets.bottom }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => {
          console.log('[MealPlanCreate] Back button pressed');
          router.back();
        }}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>New Meal Plan</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: secondaryColor }]}>PLAN NAME</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, borderColor, color: textColor }]}
            value={planName}
            onChangeText={setPlanName}
            placeholder="e.g. Week of Jun 2"
            placeholderTextColor={secondaryColor}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: secondaryColor }]}>START DATE</Text>
          <TouchableOpacity
            style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
            onPress={() => {
              console.log('[MealPlanCreate] Start date picker opened');
              setPickerMode('start');
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={20} color={colors.primary} />
            <Text style={[styles.dateButtonText, { color: textColor }]}>{formatDateDisplay(startDate)}</Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={secondaryColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: secondaryColor }]}>END DATE</Text>
          <TouchableOpacity
            style={[styles.dateButton, { backgroundColor: cardBg, borderColor }]}
            onPress={() => {
              console.log('[MealPlanCreate] End date picker opened');
              setPickerMode('end');
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={20} color={colors.primary} />
            <Text style={[styles.dateButtonText, { color: textColor }]}>{formatDateDisplay(endDate)}</Text>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={secondaryColor} />
          </TouchableOpacity>
        </View>

        <View style={[styles.hintCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.hintText, { color: secondaryColor }]}>{durationDays} day plan</Text>
        </View>

        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleCreate}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create Plan</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={pickerMode !== null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          console.log('[MealPlanCreate] Date picker modal dismissed');
          setPickerMode(null);
        }}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => {
          console.log('[MealPlanCreate] Date picker backdrop tapped, closing');
          setPickerMode(null);
        }} />
        <View style={[styles.modalSheet, { backgroundColor: isDark ? colors.cardDark : '#fff' }]}>
          <View style={styles.modalSheetHeader}>
            <Text style={[styles.modalSheetTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {pickerMode === 'start' ? 'Start Date' : 'End Date'}
            </Text>
            <TouchableOpacity onPress={() => {
              console.log('[MealPlanCreate] Date picker Done pressed, mode:', pickerMode);
              setPickerMode(null);
            }} style={styles.modalDoneButton}>
              <Text style={styles.modalDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          {pickerMode !== null && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display="spinner"
              onChange={handlePickerChange}
              minimumDate={pickerMinDate}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { padding: spacing.xs, marginRight: spacing.sm },
  headerTitle: { ...typography.h3, flex: 1 },
  headerRight: { width: 40 },
  section: { marginBottom: spacing.lg },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: spacing.sm, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  dateButtonText: { flex: 1, fontSize: 16 },
  hintCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  hintText: { fontSize: 14, fontWeight: '500' },
  createButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  createButtonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  modalSheetTitle: { fontSize: 17, fontWeight: '600' },
  modalDoneButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  modalDoneText: { fontSize: 17, fontWeight: '600', color: colors.primary },
});
