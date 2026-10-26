const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const RETAKE = 'Could not verify the nutrition label consistently. Please retake the label photo clearly.';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^\p{L}\p{N}.%]+/gu, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/(\d)\s+(?=(?:g|grams?|kcal|calories?|oz)\b)/gi, '$1');
}

function canonicalUnit(value, nutrient) {
  const unit = text(value).toLowerCase().replace(/\.$/, '');
  if (nutrient === 'calories') return ['kcal', 'cal', 'calorie', 'calories'].includes(unit) ? 'kcal' : null;
  return ['g', 'gram', 'grams', 'gm', 'gms'].includes(unit) ? 'g' : null;
}

function hasGramServingEvidence(evidence, expected) {
  const matches = [...text(evidence).matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi)];
  return matches.some(match => Math.abs(Number(match[1]) - expected) < 1e-9);
}

function labelMatches(nutrient, rowLabel) {
  const label = normalizeText(rowLabel);
  const patterns = {
    calories: /^(?:calories?|calorias?|kcal)\b/,
    protein: /^(?:proteins?|proteinas?)\b/,
    carbs: /^(?:(?:total\s+)?(?:carbohydrates?|carbs?)|(?:total\s+)?(?:carbohidrato|carbohidratos)|hidratos\s+de\s+carbono)\b/,
    fat: /^(?:total\s+fat|fat(?=\s+\d|$)|grasas?\s+totales?|grasas?(?=\s+\d|$))\b/,
    fiber: /^(?:(?:dietary\s+)?(?:fibre|fiber)|fibra(?:\s+(?:dietaria|alimentaria))?)\b/,
  };
  return patterns[nutrient].test(label);
}

function hasExactPrintedAmount(evidence, expected, nutrient) {
  const source = text(evidence);
  const normalizedSource = normalizeText(source);
  // Inequalities, approximation, or trace language in English or Spanish is not exact.
  if (/[<>~\u2264\u2265]/.test(source) || /(?:\bless\s*than(?=\s|\d)|\bmore\s*than(?=\s|\d)|\bmenos\s*de(?=\s|\d)|\bmenorde\b|\bmenor\s*que(?=\s|\d)|\bmenorque\b|\bmas\s*de(?=\s|\d)|\bmayor\s*que(?=\s|\d)|\bmayorque\b|\bunder(?=\s|\d)|\bover(?=\s|\d)|\btrace\b|\btraza\b|\babout\b|\bapprox(?:imately)?\b|\baprox(?:imadamente)?\b)/i.test(normalizedSource)) return false;
  // Reject explicit ranges, whether both endpoints include a unit or only the latter does.
  if (/\d+(?:[.,]\d+)?\s*(?:g|grams?|gm|gms)?\s*(?:-|[\u2010-\u2015]|\bto\b|\ba\b)\s*\d+(?:[.,]\d+)?\s*(?:g|grams?|gm|gms)?/i.test(source)) return false;
  if (!labelMatches(nutrient, source)) return false;
  if (nutrient === 'calories') {
    const match = normalizedSource.match(/^(?:calories?|calorias?|kcal)\s+(\d+(?:\.\d+)?)\b/);
    return !!match && Math.abs(Number(match[1]) - expected) < 1e-9;
  }
  // %DV values are ignored; there must be exactly one gram amount in the row evidence.
  const amounts = [...source.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:g|grams?|gm|gms)\b/gi)];
  return amounts.length === 1 && Math.abs(Number(amounts[0][1]) - expected) < 1e-9;
}

function columnMatchesServing(header, servingSize, servingQuantity) {
  const value = normalizeText(header);
  if (/\b(?:per|por)\s*100\s*(?:g|grams?)\b|\bper\s*100g\b/.test(value)) return false;
  if (/\bper\s+serving\b|\bserving\b|\bpor\s+porcion\b|\bporcion\b|\bracion\b/.test(value)) return true;
  // Some labels name the serving column by its gram amount, e.g. "Per 56 g".
  const servingAmount = new RegExp(`\\b${String(servingSize).replace('.', '\\.')}\\s*(?:g|grams?)\\b`).test(value);
  const servingDescriptor = normalizeText(servingQuantity).split(' ').filter(token => token.length > 2 && !/^\d/.test(token));
  return servingAmount || (/\b(?:per|por)\b/.test(value) && servingDescriptor.some(token => value.includes(token)));
}

// Front net mass is usable only for an explicit, single, same-package serving.
export function packageServingEvidence(result) {
  const p=result?.package_evidence;
  if(result?.serving_mass_basis!=='single_package_net_weight')return null;
  if(!p||p.same_package!==true||p.identity_confidence!=='high'||p.multipack!==false)return null;
  if(!['not_applicable','as_sold'].includes(p.preparation))return null;
  if(!text(p.front_product_name)||!text(p.front_brand)||!text(p.same_package_evidence))return null;
  if(!/^(?:serving size\s*)?1(?:\.0)?\s+(?:package|bag|pouch|container)$/i.test(text(p.serving_size_text)))return null;
  if(!/^1(?:\.0)?\s+servings?\s+per\s+container$/i.test(text(p.servings_per_container_text)))return null;
  if(!/^(?:serving size\s*)?1(?:\.0)?\s+(?:package|bag|pouch|container)$/i.test(text(result.serving_quantity)))return null;
  const grams=result.serving_size_g;
  if(typeof grams!=='number'||!Number.isFinite(grams)||grams<=0||p.net_weight_g!==grams)return null;
  if(!/\bnet\s*(?:wt|weight)\b/i.test(text(p.net_weight_text))||/multipack|\bpack of\b|\d\s*[x×]/i.test(text(p.net_weight_text)))return null;
  const amounts=[...text(p.net_weight_text).matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi)];
  if(amounts.length!==1||Number(amounts[0][1])!==grams)return null;
  const columns=result.detected_columns;
  if(!Array.isArray(columns)||columns.length!==1||result.selected_basis!=='per_serving')return null;
  return {grams,identity:normalizeText(p.front_brand)+'|'+normalizeText(p.front_product_name),basis:'single_package_net_weight'};
}

// Enum/boolean diagnostics only: no OCR text, images or product/profile payloads.
export function labelBasisDiagnostics(result) {
  return {basis:['per_serving','per_100g'].includes(result?.selected_basis)?result.selected_basis:'unknown',
    mass_basis:result?.serving_mass_basis==='single_package_net_weight'?'single_package_net_weight':'label_grams',
    column_count:Array.isArray(result?.detected_columns)?Math.min(result.detected_columns.length,10):0,
    has_mass:typeof result?.serving_size_g==='number'&&result.serving_size_g>0,
    package_proof_valid:!!packageServingEvidence(result)};
}

function invalid(field = 'label', reason = 'unreadable') {
  return { ok: false, message: RETAKE, issues: [{ field, reason }] };
}

/** Validate one model transcription and retain only evidence needed for deterministic comparison. */
export function validateNutritionLabelRead(result, { requireProduct = false } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return invalid();
  if (result.readability !== 'clear' || result.ambiguous !== false) return invalid();
  if (requireProduct && (result.confidence !== 'high' || result.match !== true || !text(result.product_name))) return invalid('front', 'identity_unclear');
  if (requireProduct && !(result.brand === null || typeof result.brand === 'string')) return invalid();

  const selectedColumn = text(result.selected_column_header);
  const selectedBasis = text(result.selected_basis).toLowerCase();
  const detectedColumns = result.detected_columns;
  const per100 = selectedBasis === 'per_100g' && /\b(?:per|por)\s*100\s*(?:g|grams?)\b/i.test(selectedColumn);
  const servingSize = per100 ? 100 : result.serving_size_g;
  const servingQuantity = per100 ? '100 g' : text(result.serving_quantity);
  const servingEvidence = per100 ? selectedColumn : text(result.serving_size_evidence);
  if (!selectedColumn || (!per100 && (selectedBasis !== 'per_serving' || !columnMatchesServing(selectedColumn, servingSize, servingQuantity)))) return invalid('serving', 'basis_unclear');
  if (!Array.isArray(detectedColumns) || !detectedColumns.length || !detectedColumns.every(value => typeof value === 'string' && text(value))) return invalid();
  if (!detectedColumns.some(value => normalizeText(value) === normalizeText(selectedColumn))) return invalid();
  if (typeof servingSize !== 'number' || !Number.isFinite(servingSize) || servingSize <= 0 || !servingQuantity) return invalid('serving_g', 'grams_unreadable');
  const packageMass=result.serving_mass_basis==='single_package_net_weight';
  if(packageMass && !['not_applicable','as_sold'].includes(result.package_evidence?.preparation))return invalid('preparation','state_unclear');
  if(packageMass && !packageServingEvidence(result))return invalid('serving_g','single_package_not_proven');
  if (!packageMass && (!servingEvidence || !hasGramServingEvidence(servingEvidence, servingSize))) return invalid('serving_g', 'grams_unreadable');
  if (!result.nutrients || typeof result.nutrients !== 'object' || Array.isArray(result.nutrients)) return invalid();

  const nutrients = {};
  for (const nutrient of NUTRIENTS) {
    const row = result.nutrients[nutrient];
    // An absent optional row is unknown, never an inferred zero.
    if (nutrient === 'fiber' && (row == null || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0 || !canonicalUnit(row.unit,nutrient) || !labelMatches(nutrient,row.row_label) || !hasExactPrintedAmount(row.printed_text,row.value,nutrient) || normalizeText(row.column_header)!==normalizeText(selectedColumn))) { nutrients.fiber = { value: null, unit: null }; continue; }
    if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid(nutrient);
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) return invalid(nutrient);
    const unit = canonicalUnit(row.unit, nutrient);
    const rowLabel = text(row.row_label);
    const printedText = text(row.printed_text);
    const columnHeader = text(row.column_header);
    if (!unit || !rowLabel || !labelMatches(nutrient, rowLabel) || !printedText || !hasExactPrintedAmount(printedText, row.value, nutrient)) return invalid(nutrient, 'exact_amount_unclear');
    if (nutrient !== 'calories' && !/(?:^|\d)\s*(?:g|grams?|gm|gms)\b/i.test(printedText)) return invalid();
    if (!columnHeader || normalizeText(columnHeader) !== normalizeText(selectedColumn)) return invalid();
    nutrients[nutrient] = {
      value: row.value,
      unit,
      rowLabel: nutrient,
      columnHeader: normalizeText(columnHeader || selectedColumn),
    };
  }

  return {
    ok: true,
    reading: {
      selectedColumn: normalizeText(selectedColumn),
      selectedBasis,
      massBasis:packageMass?'single_package_net_weight':'label_grams',
      packageIdentity:packageMass?packageServingEvidence(result).identity:null,
      detectedColumns: [...new Set(detectedColumns.map(normalizeText))].sort(),
      servingSize,
      servingQuantity: normalizeText(servingQuantity),
      nutrients,
    },
    productName: text(result.product_name),
    brand: result.brand === null || typeof result.brand === 'string' ? result.brand : null,
  };
}

export function compareNutritionLabelReads(firstResult, secondResult) {
  const first = validateNutritionLabelRead(firstResult, { requireProduct: true });
  if (!first.ok) return first;
  const second = validateNutritionLabelRead(secondResult);
  if (!second.ok) return second;
  if(first.reading.massBasis!==second.reading.massBasis || first.reading.packageIdentity!==second.reading.packageIdentity)return invalid('serving_g','reads_disagree');
  if (first.reading.servingSize !== second.reading.servingSize || first.reading.servingQuantity !== second.reading.servingQuantity) return invalid('serving', 'reads_disagree');
  for (const nutrient of NUTRIENTS) {
    if (nutrient === 'fiber' && (first.reading.nutrients.fiber.value == null || second.reading.nutrients.fiber.value == null || first.reading.nutrients.fiber.value !== second.reading.nutrients.fiber.value)) { first.reading.nutrients.fiber = { value: null, unit: null }; continue; }
    if (first.reading.nutrients[nutrient].value !== second.reading.nutrients[nutrient].value || first.reading.nutrients[nutrient].unit !== second.reading.nutrients[nutrient].unit) return invalid(nutrient, 'reads_disagree');
  }

  return {
    ok: true,
    productName: first.productName,
    brand: first.brand,
    servingMassBasis:first.reading.massBasis,
    servingSize: first.reading.servingSize,
    servingQuantity: first.reading.servingQuantity,
    nutrition: Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient, first.reading.nutrients[nutrient].value])),
  };
}

/** Make at most two sequential reads. The second is never called unless the first is structurally valid. */
export async function runTwoReadGate(primaryRead, independentRead, { timeoutMs = 30000 } = {}) {
  let calls = 0;
  let first;
  const controller = new AbortController();
  let timer;
  let rejectTimeout;
  const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
  timer = setTimeout(() => {
    controller.abort(new Error('Nutrition label read timed out'));
    rejectTimeout(new Error('Nutrition label read timed out'));
  }, timeoutMs);
  try {
    calls++;
    first = await Promise.race([primaryRead(controller.signal), timeout]);
  } catch {
    clearTimeout(timer);
    return { ...invalid('analysis', 'analysis_unavailable'), calls };
  }
  if (first?.finishReason !== 'stop') { clearTimeout(timer); return { ...invalid('analysis', 'analysis_unavailable'), calls }; }
  const firstCheck = validateNutritionLabelRead(first?.result, { requireProduct: true });
  if (!firstCheck.ok) { clearTimeout(timer); return { ...firstCheck, calls, basis_diagnostics:{primary:labelBasisDiagnostics(first?.result)} }; }

  let second;
  try {
    calls++;
    second = await Promise.race([independentRead(controller.signal), timeout]);
  } catch {
    clearTimeout(timer);
    return { ...invalid('analysis', 'analysis_unavailable'), calls };
  }
  clearTimeout(timer);
  if (second?.finishReason !== 'stop') return { ...invalid('analysis', 'analysis_unavailable'), calls };
  const checked = compareNutritionLabelReads(first.result, second?.result);
  if (!checked.ok) return { ...checked, calls, basis_diagnostics:{primary:labelBasisDiagnostics(first.result),independent:labelBasisDiagnostics(second?.result)} };
  return { ...checked, calls, basis_diagnostics:{primary:labelBasisDiagnostics(first.result),independent:labelBasisDiagnostics(second?.result)} };
}

export const VISION_RETAKE_MESSAGE = RETAKE;

/** Partial evidence can veto an online conflict, never authorize a shared write. */
export function readableLabelEvidence(result) {
  if (!result || result.readability !== 'clear' || result.ambiguous !== false) return null;
  const header=text(result.selected_column_header);
  const per100=result.selected_basis==='per_100g' && /\b(?:per|por)\s*100\s*g\b/i.test(header);
  const grams=per100?100:result.serving_size_g;
  if (typeof grams!=='number'||!Number.isFinite(grams)||grams<=0) return null;
  if (!per100 && (result.selected_basis!=='per_serving'||!columnMatchesServing(header,grams,result.serving_quantity)||!(result.serving_mass_basis==='single_package_net_weight'?packageServingEvidence(result):hasGramServingEvidence(result.serving_size_evidence,grams)))) return null;
  const nutrition={};
  for (const nutrient of NUTRIENTS) {
    const row=result.nutrients?.[nutrient];
    if (typeof row?.value==='number' && Number.isFinite(row.value) && row.value>=0 &&
      canonicalUnit(row.unit,nutrient) && labelMatches(nutrient,row.row_label) &&
      normalizeText(row.column_header)===normalizeText(header) && hasExactPrintedAmount(row.printed_text,row.value,nutrient)) nutrition[nutrient]=row.value;
  }
  return {serving_g:grams,serving:per100?'100 g':text(result.serving_quantity),nutrition};
}


