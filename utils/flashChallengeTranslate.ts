import i18n from '@/lib/i18n';
import type { MetricType, Difficulty } from '@/utils/flashChallengesApi';

export function getFlashChallengeTitle(metric_type: MetricType, difficulty: Difficulty): string {
  const metric = i18n.t(`flashChallenge.metric_${metric_type}`);
  const diff = i18n.t(`flashChallenge.difficulty_${difficulty}`);
  return i18n.t('flashChallenge.title', { metric, difficulty: diff });
}

export function getFlashChallengeDescription(metric_type: MetricType, target_value: number, target_unit: string): string {
  const key = `flashChallenge.desc_${metric_type}`;
  const fallback = i18n.t('flashChallenge.desc_default', { target: target_value, unit: target_unit });
  const translated = i18n.t(key, { target: target_value, unit: target_unit });
  if (translated === key) return fallback;
  return translated;
}
