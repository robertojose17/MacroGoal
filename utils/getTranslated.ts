import i18n from '@/lib/i18n';

/**
 * Reads a translated value from a Supabase record's `translations` column.
 *
 * For single-field records (trackers, meal_plan_items):
 *   translations = { "es": "Pasos", "en": "Steps" }
 *   Usage: getTranslated(record.translations, record.name)
 *
 * For multi-field records (flash_challenges, daily_missions, meal_recipes):
 *   translations = { "title": { "es": "...", "en": "..." }, "description": { "es": "...", "en": "..." } }
 *   Usage: getTranslated(record.translations, record.title, 'title')
 *          getTranslated(record.translations, record.description, 'description')
 */
export function getTranslated(
  translations: Record<string, any> | null | undefined,
  fallback: string,
  field?: string
): string {
  if (!translations) return fallback;
  const lang = i18n.language?.split('-')[0] ?? 'en';
  if (lang === 'en') return fallback; // English is the source, always use original

  if (field) {
    // Multi-field: translations.title.es
    return translations[field]?.[lang] ?? fallback;
  } else {
    // Single-field: translations.es
    return translations[lang] ?? fallback;
  }
}
