import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '@/locales/en.json';
import es from '@/locales/es.json';

export const LANGUAGE_KEY = 'app_language';

export const supportedLanguages = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
];

export const getDeviceLanguage = (): string => {
  try {
    const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
    return locale.startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
};

export const setStoredLanguage = async (lang: string): Promise<boolean> => {
  if (lang !== 'en' && lang !== 'es') return false;
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
};

// Initialize synchronously with device language as default
i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
    },
    lng: getDeviceLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

// Resolve the saved preference before mounting app-owned visible content.
// A failed storage read falls back to the device language without blocking startup.
export const languageReady: Promise<void> = AsyncStorage.getItem(LANGUAGE_KEY)
  .then(async (stored) => {
    if ((stored === 'en' || stored === 'es') && stored !== i18n.language) {
      await i18n.changeLanguage(stored);
    }
  })
  .catch(() => undefined);

export default i18n;
