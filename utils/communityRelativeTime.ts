/**
 * Compact social timestamps, identical in every locale.
 * Avoid Intl.RelativeTimeFormat: shipped Hermes runtimes may not implement it.
 * Keep the locale argument for callers shared with older app versions.
 */
export function formatCommunityRelativeTime(dateStr: string, _locale: string, now = Date.now()): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return '';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}S`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}M`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}H`;
  return `${Math.floor(seconds / 86400)}D`;
}
/** Expanded text for screen readers; the visible timestamp stays compact. */
export function communityRelativeTimeAccessibilityLabel(dateStr: string, locale: string, now = Date.now()): string {
  const compact = formatCommunityRelativeTime(dateStr, locale, now);
  if (!compact) return '';
  const amount = Number(compact.slice(0, -1));
  const unit = compact.slice(-1);
  const spanish = locale.startsWith('es');
  const labels: Record<string, string[]> = spanish
    ? { S: ['segundo', 'segundos'], M: ['minuto', 'minutos'], H: ['hora', 'horas'], D: ['día', 'días'] }
    : { S: ['second', 'seconds'], M: ['minute', 'minutes'], H: ['hour', 'hours'], D: ['day', 'days'] };
  const label = labels[unit][amount === 1 ? 0 : 1];
  return spanish ? `hace ${amount} ${label}` : `${amount} ${label} ago`;
}
