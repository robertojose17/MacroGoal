// Pure identity and persistence rules shared with the edge handler and offline tests.
export function barcodeCandidates(value) {
  if (typeof value !== 'string' || !/^\d{12,13}$/.test(value)) return value ? [value] : [];
  const checkDigit = (digits) => {
    const body = digits.slice(0, -1);
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      const fromRight = body.length - 1 - i;
      sum += Number(body[i]) * (fromRight % 2 === 0 ? 3 : 1);
    }
    return String((10 - (sum % 10)) % 10) === digits.at(-1);
  };
  if (!checkDigit(value)) return [value];
  if (value.length === 12) return [value, `0${value}`];
  if (value.length === 13 && value.startsWith('0')) return [value, value.slice(1)];
  return [value];
}

export function sameBarcode(a, b) {
  if (a === b) return true;
  const ca = barcodeCandidates(a), cb = barcodeCandidates(b);
  return ca.length > 1 && cb.length > 1 && ca.some(x => cb.includes(x));
}

// Store valid UPC-A / leading-zero EAN-13 equivalents as EAN-13 on new rows.
// Existing rows retain their original literal barcode.
export function canonicalBarcode(value) {
  const candidates = barcodeCandidates(value);
  return candidates.length > 1 && value.length === 12 ? candidates[1] : value;
}

export async function resolveCorrectionIdentity(input, repo) {
  const id = input.food_item_id || null;
  const barcode = input.barcode || null;
  if (!id && !barcode) throw new Error('food_item_id or barcode required for correction');
  const byId = id ? await repo.findById(id) : null;
  if (id && !byId) throw new Error('food item id not found');
  if (id && barcode && !sameBarcode(byId.barcode, barcode)) throw new Error('food_item_id and barcode identify different products');
  if (id) return { row: byId, barcode: byId.barcode || barcode, isNew: false };
  const matches = await repo.findByBarcodes(barcodeCandidates(barcode));
  const unique = [...new Map(matches.map(row => [row.id, row])).values()];
  if (unique.length > 1) throw new Error('barcode identifies multiple food items');
  return unique.length ? { row: unique[0], barcode: unique[0].barcode || barcode, isNew: false } : { row: null, barcode: canonicalBarcode(barcode), isNew: true };
}

export async function persistVerifiedCorrection(identity, values, repo) {
  const payload = { ...values, barcode: identity.barcode, source: 'user', ai_verified: true, verified: true, confidence: 'high' };
  if (identity.row) {
    const saved = await repo.update(identity.row.id, payload);
    if (!saved) throw new Error('verified correction update returned no persisted row');
    return saved;
  }
  try {
    const saved = await repo.insert(payload);
    if (!saved) throw new Error('verified correction insert returned no persisted row');
    return saved;
  } catch (error) {
    if (error?.code !== '23505') throw error;
    const raced = await repo.findByBarcodes(barcodeCandidates(identity.barcode));
    const unique = [...new Map(raced.map(row => [row.id, row])).values()];
    if (unique.length === 1) {
      const winner = unique[0];
      const saved = await repo.update(winner.id, {
        ...values,
        barcode: winner.barcode || identity.barcode,
        source: 'user', ai_verified: true, verified: true, confidence: 'high',
      });
      if (!saved) throw new Error('concurrent verified correction update returned no persisted row');
      return saved;
    }
    throw new Error('concurrent food item insert could not be resolved');
  }
}

export function validateVerifiedLabel(result) {
  const fail = message => ({ ok: false, status: 'error', message });
  if (!result || typeof result !== 'object' || Array.isArray(result)) return fail('Analysis returned an invalid result. Please try again.');
  if (result.confidence === 'unreadable') return fail('Could not read one or both photos clearly. Please retake them in good lighting.');
  if (result.match !== true) return fail('Could not verify that the photos match this product. Please try again.');
  if (result.confidence !== 'high') return fail('Could not verify the photos with high confidence. Please retake them clearly.');
  if (typeof result.product_name !== 'string' || !result.product_name.trim()) return fail('Could not read the product name clearly. Please retake the front photo.');
  if (!(result.brand === null || typeof result.brand === 'string')) return fail('Analysis returned an invalid product brand. Please try again.');
  if (!result.per_serving || typeof result.per_serving !== 'object' || Array.isArray(result.per_serving)) return fail('Could not read the nutrition label structure. Please retake the label photo.');
  if (typeof result.serving_size_g !== 'number' || !Number.isFinite(result.serving_size_g) || result.serving_size_g <= 0) return fail('Could not read the serving size clearly. Please retake the label photo.');
  if (typeof result.serving_quantity !== 'string' || !result.serving_quantity.trim()) return fail('Could not read the serving description clearly. Please retake the label photo.');
  const per = result.per_serving;
  const fields = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
  for (const field of fields) {
    const value = per[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fail(`Could not read ${field} from the nutrition label. Please retake the label photo.`);
  }
  return {
    ok: true,
    productName: result.product_name.trim(),
    brand: result.brand,
    servingSize: result.serving_size_g,
    servingQuantity: result.serving_quantity,
    nutrition: { calories: per.calories, protein: per.protein, carbs: per.carbs, fat: per.fat, fiber: per.fiber },
  };
}

// The edge handler uses this workflow so offline tests cover its approval/error contract.
export async function handleVerifiedCorrection(result, identity, repo) {
  const checked = validateVerifiedLabel(result);
  if (!checked.ok) return { status: 'error', message: checked.message };
  try {
    const food_item = await persistVerifiedCorrection(identity, {
      name: checked.productName,
      brand: checked.brand,
      ...checked.nutrition,
      serving_size: checked.servingSize,
      serving_quantity: checked.servingQuantity,
      serving_unit: 'g',
      macros_per: 'serving',
    }, repo);
    return { status: 'approved', food_item };
  } catch {
    return { status: 'error', message: 'Failed to save the verified nutrition label. Please try again.' };
  }
}

// food-photo-capture currently passes new products to its parser as per-100g.
// Keep persisted label values per-serving; adapt only the response representation.
export function legacyPer100gResponseItem(row) {
  if (row?.macros_per !== 'serving' || typeof row.serving_size !== 'number' || !Number.isFinite(row.serving_size) || row.serving_size <= 0) return row;
  const factor = 100 / row.serving_size;
  return {
    ...row,
    calories: row.calories * factor,
    protein: row.protein * factor,
    carbs: row.carbs * factor,
    fat: row.fat * factor,
    fiber: row.fiber * factor,
    macros_per: '100g',
  };
}
