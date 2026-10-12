import { useTranslation } from 'react-i18next';
import React from 'react';
import { View, Text } from 'react-native';

interface Props {
  assignments: Record<string, string>;
  planColors: Record<string, string>;
  onDayPress: (dateStr: string) => void;
  isDark: boolean;
}

export default function PureCalendar(_props: Props) {
  const { t } = useTranslation();
  return (
    <View>
      <Text>{t('localization.shared.calendarUnavailable')}</Text>
    </View>
  );
}
