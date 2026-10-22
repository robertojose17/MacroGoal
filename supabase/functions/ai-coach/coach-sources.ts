export type CoachSource = { url: string; title: string; retrievedAt: string };
export function coachSources(value: unknown): CoachSource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>(), result: CoachSource[] = [];
  for (const row of value.slice(0, 20)) {
    try {
      if (!row || typeof row.url !== 'string' || typeof row.title !== 'string' || typeof row.retrievedAt !== 'string' || !Number.isFinite(Date.parse(row.retrievedAt))) continue;
      const url = new URL(row.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || /(^|\.)(localhost|local|internal)$/.test(url.hostname) || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || row.url.length > 2000 || seen.has(url.href)) continue;
      seen.add(url.href); result.push({ url: url.href, title: row.title.slice(0, 160), retrievedAt: row.retrievedAt });
      if (result.length === 3) break;
    } catch { /* Untrusted provider metadata never creates an unsafe link. */ }
  }
  return result;
}

