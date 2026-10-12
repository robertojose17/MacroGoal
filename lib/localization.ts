import i18n from '@/lib/i18n';

/** Display formatting follows the app setting, never the device's unrelated locale. */
export const getAppLocale = (): 'en-US' | 'es-ES' =>
  (i18n.resolvedLanguage || i18n.language || 'en').startsWith('es') ? 'es-ES' : 'en-US';

/** Translate known preference labels without changing stored values or free text. */
export const translatePreference = (value: string): string => {
  const key = `localization.settings.preferences.${value}`;
  return i18n.exists(key) ? i18n.t(key) : value;
};
