import i18n from '@/lib/i18n';

/**
 * Translates dynamic backend text by looking it up in a translation map.
 * If no translation exists, returns the original text unchanged.
 */
export function translateDynamic(text: string | undefined | null): string {
  if (!text) return text ?? '';
  const key = `dynamic.${text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  const translated = i18n.t(key);
  // If i18next returns the key itself, no translation exists — return original
  if (translated === key) return text;
  return translated;
}
