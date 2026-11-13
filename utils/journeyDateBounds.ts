export type JourneyDateBounds = { timezone: string; today: string; created: string };
export function captureJourneyDateBounds(profile: { timezone: string | null; created_at: string | null }, now = new Date()): JourneyDateBounds {
  if (!profile.timezone || !profile.created_at) throw new Error('Account timezone and creation date must be verified.');
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: profile.timezone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' });
  const civil = (date: Date) => {
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid account date');
    const parts = formatter.formatToParts(date);
    const field = (type: string) => parts.find(p => p.type === type)?.value;
    const result = `${field('year')}-${field('month')}-${field('day')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error('Invalid account date');
    return result;
  };
  return { timezone: profile.timezone, today: civil(now), created: civil(new Date(profile.created_at)) };
}
