
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

interface CalendarDatePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  initialDate?: Date;
  maxDate?: Date;
  minDate?: Date;
  title?: string;
}

export default function CalendarDatePicker({
  visible,
  onClose,
  onSelectDate,
  initialDate = new Date(),
  maxDate = new Date(),
  minDate,
  title = 'Select Date',
}: CalendarDatePickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedDate, setSelectedDate] = useState<string>(
    initialDate.toISOString().split('T')[0]
  );

  const handleDayPress = (day: DateData) => {
    console.log('[CalendarDatePicker] Day pressed:', day.dateString);
    setSelectedDate(day.dateString);
  };

  const handleConfirm = () => {
    console.log('[CalendarDatePicker] Confirming date:', selectedDate);
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    onSelectDate(date);
    onClose();
  };

  const handleCancel = () => {
    console.log('[CalendarDatePicker] Cancelled');
    onClose();
  };

  const markedDates = {
    [selectedDate]: {
      selected: true,
      selectedColor: colors.primary,
      selectedTextColor: '#FFFFFF',
    },
  };

  const calendarTheme = {
    backgroundColor: isDark ? colors.cardDark : colors.card,
    calendarBackground: isDark ? colors.cardDark : colors.card,
    textSectionTitleColor: isDark ? colors.textDark : colors.text,
    selectedDayBackgroundColor: colors.primary,
    selectedDayTextColor: '#FFFFFF',
    todayTextColor: colors.primary,
    dayTextColor: isDark ? colors.textDark : colors.text,
    textDisabledColor: isDark ? colors.textSecondaryDark : colors.textSecondary,
    dotColor: colors.primary,
    selectedDotColor: '#FFFFFF',
    arrowColor: colors.primary,
    monthTextColor: isDark ? colors.textDark : colors.text,
    indicatorColor: colors.primary,
    textDayFontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textMonthFontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textDayHeaderFontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    textDayFontWeight: '400' as const,
    textMonthFontWeight: '600' as const,
    textDayHeaderFontWeight: '600' as const,
    textDayFontSize: 16,
    textMonthFontSize: 18,
    textDayHeaderFontSize: 14,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleCancel}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: isDark ? colors.cardDark : colors.card },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                { color: isDark ? colors.textDark : colors.text },
              ]}
            >
              {title}
            </Text>

            <Calendar
              current={selectedDate}
              onDayPress={handleDayPress}
              markedDates={markedDates}
              maxDate={maxDate?.toISOString().split('T')[0]}
              minDate={minDate?.toISOString().split('T')[0]}
              theme={calendarTheme}
              style={styles.calendar}
              enableSwipeMonths
            />

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.cancelButton,
                  {
                    backgroundColor: isDark
                      ? colors.backgroundDark
                      : colors.background,
                  },
                ]}
                onPress={handleCancel}
              >
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? colors.textDark : colors.text },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleConfirm}
              >
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                  Confirm
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 5,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  calendar: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  confirmButton: {},
  buttonText: {
    ...typography.bodyBold,
  },
});
