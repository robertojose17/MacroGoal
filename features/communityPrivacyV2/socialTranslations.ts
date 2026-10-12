import i18n from '@/lib/i18n';

/** Resolve at call time so retained callbacks use the current app language.
 * Rendering callers subscribe with useTranslation. */
export function socialT(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options) as string;
}

/** Known app-authored milestone IDs retain their wire value; unknown/user text stays intact. */
export function translateMilestone(value: string): string {
  const labels: Record<string, string> = {
    'Weight goal reached': 'milestone_weight', 'Streak milestone': 'milestone_streak',
    'Macro goal hit': 'milestone_macro', 'Personal best': 'milestone_best', 'Other': 'milestone_other',
  };
  return Object.prototype.hasOwnProperty.call(labels, value) ? socialT(`localization.social.${labels[value]}`) : value;
}
