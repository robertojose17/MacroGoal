import type { Json } from '@/lib/supabase/types';

/** Validate JSON without turning unknown values, non-finite numbers or cycles into data. */
export function toJson(value: unknown): Json {
  const ancestors = new Set<object>();
  function visit(item: unknown): Json {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object' || ancestors.has(item)) throw new Error('invalid_json_value');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) return Array.from(item, visit);
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('invalid_json_object');
      const result: { [key: string]: Json } = {};
      for (const [key, entry] of Object.entries(item)) Object.defineProperty(result, key, { value: visit(entry), enumerable: true, configurable: true, writable: true });
      return result;
    } finally { ancestors.delete(item); }
  }
  return visit(value);
}
export function jsonRecord(value: unknown): { [key: string]: Json | undefined } | undefined {
  if (value === null || value === undefined) return undefined;
  const result = toJson(value);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('invalid_json_record');
  return result;
}
