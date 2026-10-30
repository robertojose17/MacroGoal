/** Hermes in shipped native builds may not implement Intl.RelativeTimeFormat. */
export function formatCommunityRelativeTime(dateStr: string, locale: string, now = Date.now()): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return '';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  const unit = seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : seconds < 86400 ? 'hour' : 'day';
  const amount = unit === 'second' ? 0 : Math.floor(seconds / (unit === 'minute' ? 60 : unit === 'hour' ? 3600 : 86400));

  if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }).format(-amount, unit);
    } catch {
      // A partial Intl implementation must not prevent posts or comments rendering.
    }
  }

  const spanish = locale.startsWith('es');
  if (unit === 'second') return spanish ? 'ahora' : 'now';
  if (unit === 'day' && amount === 1) return spanish ? 'ayer' : 'yesterday';
  if (spanish) {
    const label = unit === 'minute' ? 'min' : unit === 'hour' ? 'h' : amount === 1 ? 'día' : 'días';
    return `hace ${amount} ${label}`;
  }
  const label = unit === 'minute' ? 'min.' : unit === 'hour' ? 'hr.' : 'days';
  return `${amount} ${label} ago`;
}
