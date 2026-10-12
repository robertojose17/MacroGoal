import i18n from '@/lib/i18n';

/** Legacy stored placeholders must remain excluded regardless of the current UI language. */
export function isCoachPlaceholder(content: string): boolean {
  return content === '' || content === '__FIRST_INTERACTION__' ||
    content === 'Something went wrong. Please try again.' ||
    content === i18n.t('localization.shared.tryAgain', { lng: 'en' }) ||
    content === i18n.t('localization.shared.tryAgain', { lng: 'es' });
}
