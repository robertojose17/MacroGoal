import i18n from '@/lib/i18n';
import { LocaleConfig } from 'react-native-calendars';
import { getAppLocale } from '@/lib/localization';

/** Apply the selected app language before the calendar renders. */
export function configureCalendarLocale(): void {
  const locale = getAppLocale();
  const months = Array.from({ length: 12 }, (_, month) => new Date(2024, month, 1));
  const days = Array.from({ length: 7 }, (_, day) => new Date(2024, 0, 7 + day));
  LocaleConfig.locales[locale] = {
    monthNames: months.map(date => date.toLocaleDateString(locale, { month: 'long' })),
    monthNamesShort: months.map(date => date.toLocaleDateString(locale, { month: 'short' })),
    dayNames: days.map(date => date.toLocaleDateString(locale, { weekday: 'long' })),
    dayNamesShort: days.map(date => date.toLocaleDateString(locale, { weekday: 'short' })),
    today: i18n.t('common.today'),
  };
  LocaleConfig.defaultLocale = locale;
}
