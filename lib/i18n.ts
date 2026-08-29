import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from '@/locales/en.json';
import es from '@/locales/es.json';

const LANGUAGE_KEY = 'app_language';

export const supportedLanguages = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
];

export const getStoredLanguage = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredLanguage = async (lang: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  } catch {}
};

export const getDeviceLanguage = (): string => {
  try {
    const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
    return locale.startsWith('es') ? 'es' : 'en';
  } catch {
    return 'en';
  }
};

const initI18n = async () => {
  const stored = await getStoredLanguage();
  const language = stored ?? getDeviceLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
        es: { translation: es },
      },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
    });
};

initI18n();

export default i18n;
