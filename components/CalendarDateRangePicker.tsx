
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

interface CalendarDateRangePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectRange: (startDate: Date, endDate: Date) => void;
  initialStartDate?: Date;
  initialEndDate?: Date;
  maxDate?: Date;
  minDate?: Date;
  title?: string;
}

export default function CalendarDateRangePicker({
  visible,
  onClose,
  onSelectRange,
  initialStartDate = new Date(),
  initialEndDate = new Date(),
  maxDate = new Date(),
  minDate,
  title = 'Select Date Range',
}: CalendarDateRangePickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [startDate, setStartDate] = useState<string | null>(
    initialStartDate.toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string | null>(
    initialEndDate.toISOString().split('T')[0]
  );
  const [tapCount, setTapCount] = useState<number>(2); // Start at 2 since we have initial dates

  const handleDayPress = (day: DateData) => {
    console.log('[CalendarDateRangePicker] Day pressed:', day.dateString, 'tapCount:', tapCount);
    
    if (tapCount === 0 || tapCount === 2) {
      // First tap or third tap (reset): Set start date only
      console.log('[CalendarDateRangePicker] Setting start date:', day.dateString);
      setStartDate(day.dateString);
      setEndDate(null);
      setTapCount(1);
    } else if (tapCount === 1) {
      // Second tap: Set end date (or swap if necessary)
      console.log('[CalendarDateRangePicker] Setting end date:', day.dateString);
      
      if (startDate) {
        // Compare dates and swap if necessary
        if (day.dateString < startDate) {
          console.log('[CalendarDateRangePicker] Swapping dates - end is before start');
          setStartDate(day.dateString);
          setEndDate(startDate);
        } else {
          setEndDate(day.dateString);
        }
        setTapCount(2);
      }
    }
  };

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      console.log('[CalendarDateRangePicker] Cannot confirm - missing dates');
      return;
    }

    console.log('[CalendarDateRangePicker] Confirming range:', startDate, 'to', endDate);
    
    // Parse dates at midnight in local timezone to ensure inclusivity
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    // Create dates at midnight local time (no timezone offset issues)
    const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);
    
    console.log('[CalendarDateRangePicker] Parsed dates:', start.toISOString(), 'to', end.toISOString());
    
    onSelectRange(start, end);
    onClose();
  };

  const handleCancel = () => {
    console.log('[CalendarDateRangePicker] Cancelled');
    onClose();
  };

  const handleReset = () => {
    console.log('[CalendarDateRangePicker] Reset selection');
    setStartDate(null);
    setEndDate(null);
    setTapCount(0);
  };

  const getMarkedDates = () => {
    const marked: any = {};

    if (startDate && !endDate) {
      // Only start date selected
      marked[startDate] = {
        selected: true,
        color: colors.primary,
        textColor: '#FFFFFF',
      };
    } else if (startDate && endDate) {
      // Both dates selected - show range
      marked[startDate] = {
        startingDay: true,
        color: colors.primary,
        textColor: '#FFFFFF',
      };

      marked[endDate] = {
        endingDay: true,
        color: colors.primary,
        textColor: '#FFFFFF',
      };

      // Fill in the dates between start and end
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      current.setDate(current.getDate() + 1);

      while (current < end) {
        const dateString = current.toISOString().split('T')[0];
        marked[dateString] = {
          color: colors.primary + '40',
          textColor: isDark ? colors.textDark : colors.text,
        };
        current.setDate(current.getDate() + 1);
      }
    }

    return marked;
  };

  const getInstructionText = () => {
    if (tapCount === 0) {
      return 'Tap to select start date';
    } else if (tapCount === 1) {
      return 'Tap to select end date';
    } else {
      return 'Tap any date to start a new selection';
    }
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

            <View style={styles.instructionContainer}>
              <Text
                style={[
                  styles.instructionText,
                  { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
                ]}
              >
                {getInstructionText()}
              </Text>
              {startDate && endDate && (
                <TouchableOpacity onPress={handleReset}>
                  <Text style={[styles.resetText, { color: colors.primary }]}>
                    Reset
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {startDate && (
              <View style={styles.selectedDatesContainer}>
                <View style={styles.selectedDateItem}>
                  <Text
                    style={[
                      styles.selectedDateLabel,
                      { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
                    ]}
                  >
                    Start:
                  </Text>
                  <Text
                    style={[
                      styles.selectedDateValue,
                      { color: isDark ? colors.textDark : colors.text },
                    ]}
                  >
                    {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                {endDate && (
                  <View style={styles.selectedDateItem}>
                    <Text
                      style={[
                        styles.selectedDateLabel,
                        { color: isDark ? colors.textSecondaryDark : colors.textSecondary },
                      ]}
                    >
                      End:
                    </Text>
                    <Text
                      style={[
                        styles.selectedDateValue,
                        { color: isDark ? colors.textDark : colors.text },
                      ]}
                    >
                      {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <Calendar
              current={startDate || undefined}
              onDayPress={handleDayPress}
              markedDates={getMarkedDates()}
              markingType="period"
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
                  { 
                    backgroundColor: colors.primary,
                    opacity: startDate && endDate ? 1 : 0.5,
                  },
                ]}
                onPress={handleConfirm}
                disabled={!startDate || !endDate}
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
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  instructionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  instructionText: {
    ...typography.caption,
    fontSize: 13,
  },
  resetText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  selectedDatesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.md,
  },
  selectedDateItem: {
    alignItems: 'center',
  },
  selectedDateLabel: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: 2,
  },
  selectedDateValue: {
    ...typography.bodyBold,
    fontSize: 14,
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
