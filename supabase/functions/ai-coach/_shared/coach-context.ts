// Calendar context is optional for older clients; it never controls authorization.
export function validatedCoachTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || value.trim() !== value) return null;
  try { return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone || null; }
  catch { return null; }
}
export function coachTimeZone(value?: unknown): string { return validatedCoachTimeZone(value) ?? 'UTC'; }
export function deviceCoachTimeZone(): string {
  try { return coachTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }
  catch { return 'UTC'; }
}
export function coachDate(now: number | Date = Date.now(), timeZone: unknown = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: coachTimeZone(timeZone), year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftCoachDate(day: string, days: number): string {
  // Calendar arithmetic on a date label, not elapsed 24-hour periods across DST.
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function displayTdeeWeight(pounds: number, unit: string): string {
  return (unit === 'kg' ? pounds / 2.20462 : pounds).toFixed(1);
}

