import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PendingUsdaIdentity } from './usdaSelectionPersistence';

const DRAFT_KEY = '@my_meals_draft';

export interface PendingDraftIdentity extends PendingUsdaIdentity {
  navigationId: string;
}
export interface DraftItem {
  tempId: string;
  food_id: string;
  food_item_id?: string;
  pending_usda_identity?: PendingDraftIdentity;
  resolved_usda_identity?: PendingDraftIdentity;
  food_name: string;
  food_brand?: string;
  serving_amount: number;
  serving_unit: string;
  serving_description?: string;
  servings_count: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

// Serialize every local writer so reconciliation cannot restore a removed item,
// overwrite a concurrent edit, or race a clear/append with a stale array.
let writes: Promise<void> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation);
  writes = next.then(() => undefined, () => undefined);
  return next;
}
async function readDraft(): Promise<DraftItem[]> {
  const data = await AsyncStorage.getItem(DRAFT_KEY);
  return data ? JSON.parse(data) : [];
}
async function writeDraft(items: DraftItem[]): Promise<void> {
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(items));
}

function sameIdentity(a: PendingDraftIdentity | undefined, b: PendingDraftIdentity | undefined): boolean {
  return !!a && !!b && a.userId === b.userId && a.sessionEpoch === b.sessionEpoch &&
    a.fdcId === b.fdcId && a.operationId === b.operationId && a.navigationId === b.navigationId;
}
export async function saveDraft(items: DraftItem[]): Promise<void> {
  try { await serialize(async () => {
    const current = await readDraft();
    // saveDraft edits/removes existing entries; only addToDraft may append.
    // A snapshot loaded before clearDraft must not restore a consumed entry.
    const next = items.filter(item => current.some(row => row.tempId === item.tempId)).map(item => {
      const saved = current.find(row => row.tempId === item.tempId && row.food_id === item.food_id);
      if (!item.food_item_id && saved?.food_item_id && sameIdentity(item.pending_usda_identity, saved.resolved_usda_identity)) {
        // A caller may have loaded before reconciliation. Keep its edits, not its stale identity.
        const merged = { ...item, food_item_id: saved.food_item_id, resolved_usda_identity: saved.resolved_usda_identity };
        delete merged.pending_usda_identity;
        return merged;
      }
      return item;
    });
    await writeDraft(next);
  }); }
  catch (error) { console.error('[MyMealsDraft] Error saving draft:', error); }
}
export async function loadDraft(): Promise<DraftItem[]> {
  try { await writes; return await readDraft(); }
  catch (error) { console.error('[MyMealsDraft] Error loading draft:', error); return []; }
}
export async function clearDraft(): Promise<void> {
  try { await serialize(() => AsyncStorage.removeItem(DRAFT_KEY)); }
  catch (error) { console.error('[MyMealsDraft] Error clearing draft:', error); }
}

/** Returns the exact local entry identity. Existing callers may ignore it. */
export async function addToDraft(item: Omit<DraftItem, 'tempId'>, isCurrent?: () => boolean | Promise<boolean>): Promise<string | null> {
  try {
    return await serialize(async () => {
      if (isCurrent && !await isCurrent()) return null;
      const currentDraft = await readDraft();
      if (isCurrent && !await isCurrent()) return null;
      const newItem: DraftItem = { ...item, tempId: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}` };
      await writeDraft([...currentDraft, newItem]);
      return newItem.tempId;
    });
  } catch (error) { console.error('[MyMealsDraft] Error adding to draft:', error); return null; }
}

/** Identity-only reconciliation. Never look up an entry by name, position or nutrition.
 * A consumed draft has no verified destination; do not guess a saved-meal row.
 */
export async function reconcileDraftIdentity(
  target: { tempId: string; foodId: string; pending: PendingDraftIdentity },
  foodItemId: string,
  isCurrent: () => Promise<boolean>,
): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(foodItemId)) return false;
  try {
    return await serialize(async () => {
      if (!await isCurrent()) return false;
      const items = await readDraft();
      const entry = items.find(item => item.tempId === target.tempId);
      const pending = entry?.pending_usda_identity;
      if (!entry || entry.food_id !== target.foodId || entry.food_item_id || !sameIdentity(pending, target.pending) || !await isCurrent()) return false;
      // Preserve every other field from the latest storage read, including user edits.
      entry.food_item_id = foodItemId;
      entry.resolved_usda_identity = pending;
      delete entry.pending_usda_identity;
      await writeDraft(items);
      return true;
    });
  } catch { return false; }
}
