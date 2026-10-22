// No data logging: failures are codes only. Unknown categories fail closed.
export const MEMORY_CATEGORIES = ['food_preference', 'disliked_food', 'meal_habit', 'craving_pattern', 'satiety_food', 'restaurant', 'store', 'schedule', 'barrier', 'strategy', 'motivation', 'coaching_style', 'budget', 'cooking_ability', 'restriction', 'goal', 'biometric', 'onboarding', 'achievement'] as const;
const aliases: Record<string, readonly string[]> = {
  food_preferences: ['food_preference', 'disliked_food'], restrictions: ['restriction'],
  preference: ['food_preference', 'disliked_food', 'coaching_style'],
  habit: ['meal_habit', 'schedule', 'craving_pattern'], habits: ['meal_habit', 'schedule', 'craving_pattern'],
  lifestyle: ['schedule', 'budget', 'cooking_ability'], challenge: ['barrier'],
};
export function categoryScope(category: unknown): readonly string[] {
  if (typeof category !== 'string') return [];
  return (MEMORY_CATEGORIES as readonly string[]).includes(category) ? [category] : aliases[category] || [];
}
export type MemorySettings = { memory_enabled: boolean; auto_infer: boolean; blocked_categories: string[] };
const disabled: MemorySettings = { memory_enabled: false, auto_infer: false, blocked_categories: [] };
export async function readMemorySettings(db: any, userId: string): Promise<MemorySettings> {
  try {
    const { data, error } = await db.from('coach_memory_settings').select('memory_enabled, auto_infer, blocked_categories').eq('user_id', userId).maybeSingle();
    if (error) return disabled;
    if (!data) return { memory_enabled: true, auto_infer: true, blocked_categories: [] };
    if (typeof data.memory_enabled !== 'boolean' || typeof data.auto_infer !== 'boolean' || !Array.isArray(data.blocked_categories) || data.blocked_categories.some((c: unknown) => typeof c !== 'string')) return disabled;
    return data;
  } catch { return disabled; }
}
export function memoryAllowed(settings: MemorySettings, category: unknown, infer = false): boolean {
  const scope = categoryScope(category);
  if (!settings.memory_enabled || (infer && !settings.auto_infer) || !scope.length) return false;
  return !settings.blocked_categories.some(blocked => {
    const blockedScope = categoryScope(blocked);
    return blocked === category || blockedScope.some(c => scope.includes(c));
  });
}
export async function readCoachMemories(db: any, userId: string) {
  const initial = await readMemorySettings(db, userId);
  if (!initial.memory_enabled) return { data: [], error: null };
  const result = await db.from('coach_memory').select('key, value, category, is_blocked').eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
  if (result.error) return { data: [], error: 'memory_read_failed' };
  const current = await readMemorySettings(db, userId);
  return { data: (result.data || []).filter((m: any) => m.is_blocked === false && memoryAllowed(initial, m.category) && memoryAllowed(current, m.category)), error: null };
}
export type UserMessage = { role: string; content: string };
export function groundedMemory(candidate: any, messages: UserMessage[]) {
  // Store an exact user quote, never an assistant paraphrase/recommendation.
  if (!candidate || !(MEMORY_CATEGORIES as readonly string[]).includes(candidate.category) || !/^[a-z][a-z0-9_]{0,79}$/.test(candidate.key || '') || typeof candidate.value !== 'string' || candidate.value.length < 3 || candidate.value.length > 1000) return null;
  if (!messages.some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes(candidate.value) && !m.content.startsWith('__'))) return null;
  return { key: candidate.key, value: candidate.value, category: candidate.category };
}
export async function writeCoachMemories(db: any, userId: string, candidates: unknown[], messages: UserMessage[]) {
  let written = 0;
  for (const candidate of candidates.slice(0, 20)) {
    const memory = groundedMemory(candidate, messages);
    if (!memory) continue;
    const settings = await readMemorySettings(db, userId);
    if (!memoryAllowed(settings, memory.category, true)) continue;
    // SQL checks settings again under a lock; no unguarded fallback.
    const { data, error } = await db.rpc('coach_store_memory_v1', { p_user_id: userId, p_key: memory.key, p_value: memory.value, p_category: memory.category });
    if (error) throw new Error('memory_write_failed');
    if (data === true) written++;
  }
  return written;
}

const markers = ['MEMORY_UPDATE:', 'ACTION_PROPOSAL:'];
export function createDirectiveFilter() {
  let pending = '', hidden = false;
  return {
    push(chunk: string): string {
      if (hidden) return '';
      pending += chunk;
      const positions = markers.map(m => pending.indexOf(m)).filter(i => i >= 0);
      if (positions.length) { const result = pending.slice(0, Math.min(...positions)); pending = ''; hidden = true; return result; }
      let retained = 0;
      for (const marker of markers) for (let n = 1; n < marker.length; n++) if (pending.endsWith(marker.slice(0, n))) retained = Math.max(retained, n);
      const result = pending.slice(0, pending.length - retained); pending = pending.slice(pending.length - retained); return result;
    },
    // Even an interrupted prefix must never appear in the chat.
    finish(): string { pending = ''; return ''; },
  };
}
export function visibleCoachText(text: string) { return createDirectiveFilter().push(text).trim(); }
export function memoryDirectives(text: string): unknown[] {
  const result: unknown[] = [];
  for (const match of text.matchAll(/MEMORY_UPDATE:\s*/g)) {
    const start = match.index! + match[0].length;
    if (text[start] !== '{') continue;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
      else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { try { result.push(JSON.parse(text.slice(start, i + 1))); } catch {} break; }
    }
  }
  return result;
}

/** Revalidate a previously read snapshot after other awaited context queries. */
export async function revalidateCoachMemories(db: any, userId: string, rows: any[]) {
  const settings = await readMemorySettings(db, userId);
  return rows.filter(m => m?.is_blocked === false && memoryAllowed(settings, m.category));
}

/** Untyped historical memory cannot be safely filtered by individual category. */
export function historicalMemoryAllowed(settings: MemorySettings, infer = false): boolean {
  return settings.memory_enabled && (!infer || settings.auto_infer) && settings.blocked_categories.length === 0;
}

/** For automatic reuse only; explicit user inspection of stored records is separate. */
export async function readHistoricalCoachMemory<T>(db: any, userId: string, read: () => PromiseLike<{data: T | null; error?: unknown}>) {
  if (!historicalMemoryAllowed(await readMemorySettings(db, userId))) return {data: null, error: null};
  try {
    const result = await read();
    if (result.error) return {data: null, error: 'history_read_failed'};
    if (!historicalMemoryAllowed(await readMemorySettings(db, userId))) return {data: null, error: null};
    return {data: result.data, error: null};
  } catch { return {data: null, error: 'history_read_failed'}; }
}

/** A model's recommendation is not evidence of a user's commitment. */
export function validatedCoachSummary(value: unknown, messages: UserMessage[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.objective !== 'string' || !row.objective.trim() || row.objective.length > 2000 ||
      !Number.isInteger(row.importance) || Number(row.importance) < 0 || Number(row.importance) > 100) return null;
  const result: Record<string, unknown> = {objective: row.objective, importance: row.importance};
  for (const name of ['obstacle', 'decisions', 'follow_up', 'coaching_observations']) {
    const item = row[name];
    if (item != null && (typeof item !== 'string' || item.length > 2000)) return null;
    result[name] = item ?? null;
  }
  if (row.confidence != null && (!Number.isInteger(row.confidence) || Number(row.confidence) < 0 || Number(row.confidence) > 100)) return null;
  if (row.confidence != null) result.confidence = row.confidence;
  const commitment = row.commitments;
  result.commitments = typeof commitment === 'string' && commitment.length <= 2000 && commitment.trim() &&
    messages.some(m => m.role === 'user' && typeof m.content === 'string' && !m.content.startsWith('__') && m.content.includes(commitment))
    ? commitment : null;
  return result;
}

