/** Shared bounded JSON decoder for model discovery annotations and cited page priorities. */
export function parseDishJSON(content: unknown): { dishes: unknown[] } | null {
  if (typeof content !== 'string' || content.length > 128 * 1024) return null;
  let text = content.trim();
  const fence = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
  if (fence) text = fence[1];
  try { const parsed = JSON.parse(text); return parsed && Array.isArray(parsed.dishes) ? parsed : null; }
  catch { return null; }
}
