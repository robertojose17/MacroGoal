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
