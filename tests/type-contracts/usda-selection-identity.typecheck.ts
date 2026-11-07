import { persistUsdaSelection, continueUsdaSelection, reconcileUsdaSelection, usdaIdentityIsCurrent } from '../../utils/usdaSelectionPersistence';
import type { PendingUsdaIdentity, UsdaSelectionOutcome } from '../../utils/usdaSelectionPersistence';
import { addToDraft, reconcileDraftIdentity } from '../../utils/myMealsDraft';
import type { DraftItem, PendingDraftIdentity } from '../../utils/myMealsDraft';
import type { OpenFoodFactsProduct } from '../../utils/openFoodFacts';

/** Compile-only caller contract: unknown is not an absent identity or a persisted UUID. */
export function selectionContracts(product: OpenFoodFactsProduct, pending: PendingUsdaIdentity, draft: Omit<DraftItem, 'tempId'>) {
  const result: Promise<UsdaSelectionOutcome> = persistUsdaSelection(product);
  const continuation: Promise<UsdaSelectionOutcome> = continueUsdaSelection(pending);
  const readback: Promise<UsdaSelectionOutcome> = reconcileUsdaSelection(pending);
  const current: boolean = usdaIdentityIsCurrent(pending);
  const entryId: Promise<string | null> = addToDraft(draft);
  const local: PendingDraftIdentity = { ...pending, navigationId: 'navigation' };
  const reconciled: Promise<boolean> = reconcileDraftIdentity({ tempId: 'entry', foodId: 'legacy', pending: local }, 'uuid', async () => current);
  return { result, continuation, readback, entryId, reconciled };
}
export function verifiedId(result: UsdaSelectionOutcome): string | null {
  switch (result.status) {
    case 'persisted': return result.foodItemId;
    case 'unknown': return null;
    case 'not_applicable': return null;
  }
}
