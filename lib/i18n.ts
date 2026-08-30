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

export const setStoredLanguage = async (lang: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {}
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

// Then async-override with stored preference if any
AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
  if (stored && stored !== i18n.language) {
    i18n.changeLanguage(stored);
  }
});

export default i18n;
