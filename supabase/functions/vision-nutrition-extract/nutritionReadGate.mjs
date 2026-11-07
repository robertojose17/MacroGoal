const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const RETAKE = 'Could not verify the nutrition label consistently. Please retake the label photo clearly.';

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u2010-\u2014]/g, '-')
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
  return matches.length > 0 && matches.every(match => Math.abs(Number(match[1]) - expected) < 1e-9);
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
    // A literal bilingual row repeats the same nutrient label, not a second amount.
    // Keep the slash and require the entire bilingual evidence to contain one exact value.
    const bilingual = source.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().match(/^(?:calories?\s*\/\s*calorias?|calorias?\s*\/\s*calories?)\s+(\d+(?:\.\d+)?)\s*(?:kcal)?$/i);
    if (bilingual) return Math.abs(Number(bilingual[1]) - expected) < 1e-9;
    const match = normalizedSource.match(/^(?:calories?|calorias?|kcal)\s+(\d+(?:\.\d+)?)\b/);
    return !!match && Math.abs(Number(match[1]) - expected) < 1e-9;
  }
  // %DV values are ignored; there must be exactly one gram amount in the row evidence.
  const amounts = [...source.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:g|grams?|gm|gms)\b/gi)];
  return amounts.length === 1 && Math.abs(Number(amounts[0][1]) - expected) < 1e-9;
}

function printedServingCount(value, column=false) {
  const fractions={'\u00bc':'1/4','\u00bd':'1/2','\u00be':'3/4'};
  let raw=text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[\u00bc\u00bd\u00be]/g,x=>' '+fractions[x]+' ');
  if(column) {
    const prefix=/\b(?:per|por)\s+/.exec(raw);if(!prefix)return null;
    raw=raw.slice(prefix.index+prefix[0].length);
  } else raw=raw.replace(/^(?:serving size|tamano de porcion)\s*:?\s*/, '');
  const match=/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*([\p{L}]+)/u.exec(raw.trim());
  if(!match)return null;
  const parts=match[1].split(/\s+/);let count=0;
  for(const part of parts) {
    const fraction=part.split('/').map(Number);
    if(fraction.length===2){if(!fraction[1])return null;count+=fraction[0]/fraction[1];}else count+=fraction[0];
  }
  return Number.isFinite(count)&&count>0?{count,unit:match[2].replace(/s$/,'')}:null;
}

// Deliberately small grammar for a literal serving declaration. Do not scan arbitrary
// OCR, nutrient rows, front-package claims, or alternate columns for a gram number.
// Preserve signs, slashes and punctuation: fuzzy normalization would erase qualifiers
// or make a fraction header look equal to a range.
function literalHeaderKey(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

// Source columns only: canonicalize whitespace, never punctuation or amounts.
// The parenthesized group must already have the exact supported gram[/oz] form.
// In particular, do not join fraction digits or introduce comma/semicolon aliases.
// Physical-photo reads continue through the unchanged literal grammar below.
export function normalizeDeclaredColumnTypography(value) {
  return text(value).replace(/\s+/g, ' ').replace(
    /\s*\(\s*(\d+(?:\.\d+)?)\s*(g|grams?)(?:\s*\/\s*(\d+(?:\.\d+)?)\s*(oz))?\s*\)/gi,
    (_, grams, gramUnit, ounces, ounceUnit) => ` (${grams}${gramUnit}${ounces === undefined ? '' : '/' + ounces + ounceUnit})`,
  ).trim();
}

// Unknown nouns and preparation/approximation words are not treated as serving units.
// Extending this small list requires evidence and regressions, not a free-form fallback.
const LITERAL_COUNTED_UNITS = new Set([
  'slice', 'piece', 'cracker', 'cookie', 'biscuit', 'bar', 'cup', 'tablespoon',
  'teaspoon', 'tbsp', 'tsp', 'scoop', 'package', 'bag', 'pouch', 'container',
  'serving', 'portion', 'porcion', 'racion', 'rebanada', 'pieza', 'galleta',
  'barra', 'taza', 'cucharada', 'cucharadita', 'paquete', 'bolsa', 'envase',
]);

function parseLiteralServingDescription(value) {
  const fractions = { '\u00bc': '1/4', '\u00bd': '1/2', '\u00be': '3/4' };
  const source = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[\u00bc\u00bd\u00be]/g, value => ' ' + fractions[value] + ' ').trim();
  const directMass = /^(\d+(?:\.\d+)?)\s*(?:g|grams?)$/.exec(source);
  if (directMass) {
    const grams = Number(directMass[1]);
    return Number.isFinite(grams) && grams > 0 ? { count: grams, unit: 'g', grams } : null;
  }
  // Parenthesized grams may be accompanied by the printed ounces. Ounces are
  // never converted, checked for an assumed ratio, or used to compute grams.
  const counted = /^(\d+\s+\d+\/[1-9]\d*|\d+\/[1-9]\d*|\d+(?:\.\d+)?)\s*([a-z]+)(?:\s*\(\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)(?:\s*\/\s*\d+(?:\.\d+)?\s*oz)?\s*\))?$/.exec(source);
  if (!counted) return null;
  const descriptor = printedServingCount(source);
  if (!descriptor || !LITERAL_COUNTED_UNITS.has(descriptor.unit)) return null;
  const grams = counted[3] === undefined ? null : Number(counted[3]);
  if (grams !== null && (!Number.isFinite(grams) || grams <= 0)) return null;
  return { ...descriptor, grams };
}

export const DECLARED_SERVING_GRAMMAR_CLASSES = Object.freeze([
  'absent', 'missing', 'invalid_type', 'empty', 'unrecognized_declaration',
  'unsupported_description', 'missing_grams', 'multiple_generic_servings', 'literal_mass',
]);

// A bounded diagnostic category, not a fallback or proof of column association.
export function declaredServingGrammarClassification(value) {
  if (value === null) return 'absent';
  if (value === undefined) return 'missing';
  if (typeof value !== 'string') return 'invalid_type';
  const line = normalizeDeclaredColumnTypography(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!line) return 'empty';
  const declaration = /^(?:serving\s+size|tamano\s+de\s+porcion)\s*:?\s*(.+)$/i.exec(line);
  if (!declaration) return 'unrecognized_declaration';
  const declared = parseLiteralServingDescription(declaration[1]);
  if (!declared) return 'unsupported_description';
  if (declared.grams === null) return 'missing_grams';
  if (['serving', 'portion', 'porcion', 'racion'].includes(declared.unit) && declared.count !== 1) return 'multiple_generic_servings';
  return 'literal_mass';
}

/** Resolve only a missing scalar from this read's complete, exact declared line.
 * This is not OCR repair: an absent/qualified/conflicting line remains unknown.
 * Existing numeric output is never replaced, and the package exception is separate.
 */
export function declaredServingMassFallback(result) {
  if (result?.serving_size_g !== null && result?.serving_size_g !== undefined) return null;
  if (result?.selected_basis !== 'per_serving' || result?.serving_mass_basis !== 'label_grams' || result?.package_evidence != null) return null;
  const line = text(result.serving_size_evidence).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const declaration = /^(?:serving\s+size|tamano\s+de\s+porcion)\s*:?\s*(.+)$/i.exec(line);
  if (!declaration) return null;
  const declared = parseLiteralServingDescription(declaration[1]);
  if (!declared || declared.grams === null) return null;
  // '2 servings/portions' cannot be assumed to mean a single generic serving.
  if (['serving', 'portion', 'porcion', 'racion'].includes(declared.unit) && declared.count !== 1) return null;
  const quantityText = text(result.serving_quantity).replace(/^(?:serving\s+size|tama[nñ]o\s+de\s+porci[oó]n)\s*:?\s*/i, '');
  const quantity = parseLiteralServingDescription(quantityText);
  if (!quantity || quantity.count !== declared.count || quantity.unit !== declared.unit || (quantity.grams !== null && quantity.grams !== declared.grams)) return null;
  const selected = text(result.selected_column_header);
  const columns = result.detected_columns;
  if (!Array.isArray(columns) || !columns.length || !columns.every(column => typeof column === 'string' && text(column))) return null;
  if (columns.filter(column => literalHeaderKey(column) === literalHeaderKey(selected)).length !== 1) return null;
  const header = selected.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(?:per|por)\s*100\s*(?:g|grams?)\b/.test(header)) return null;
  if (/^(?:per\s+serving|por\s+porcion)$/.test(header)) return declared.grams;
  const headerQuantity = parseLiteralServingDescription(header.replace(/^(?:per|por)\s+/, ''));
  if (!headerQuantity || (headerQuantity.grams !== null && headerQuantity.grams !== declared.grams)) return null;
  if (headerQuantity.unit === 'g') return headerQuantity.grams === declared.grams ? declared.grams : null;
  const genericUnits = ['serving', 'portion', 'porcion', 'racion'];
  if (genericUnits.includes(headerQuantity.unit)) {
    // A declared '2 portions' cannot be bound to an alternate 'Per 1 portion'.
    if (genericUnits.includes(declared.unit)) return headerQuantity.count === declared.count && headerQuantity.unit === declared.unit ? declared.grams : null;
    return headerQuantity.count === 1 ? declared.grams : null;
  }
  return headerQuantity.count === declared.count && headerQuantity.unit === declared.unit ? declared.grams : null;
}

function resolvedServingMass(result) {
  return result?.serving_size_g ?? declaredServingMassFallback(result);
}

// Exact bilingual count/mass grammar observed on a physical label. Never infer mass
// from the bag, serving count, ounces or a translated/nonmatching unit.
function bilingualUnitServing(value, declaration = false) {
  let raw = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (declaration) {
    const prefix = /^serving\s+size\s*\/\s*tamano\s+servicio\s+/.exec(raw);
    if (!prefix) return null;
    raw = raw.slice(prefix[0].length);
  }
  const match = /^(\d+(?:\.\d+)?)\s+unit\s*\/\s*unidad\s*\(\s*(\d+(?:\.\d+)?)\s*g\s*\)$/.exec(raw);
  if (!match) return null;
  const count = Number(match[1]), grams = Number(match[2]);
  return Number.isFinite(count) && count > 0 && Number.isFinite(grams) && grams > 0 ? {count, grams} : null;
}
function columnMatchesServing(header, servingSize, servingQuantity, servingEvidence) {
  const value = normalizeText(header);
  if (/\bunit\s*\/\s*unidad\b/i.test(servingQuantity + ' ' + servingEvidence)) {
    const quantity = bilingualUnitServing(servingQuantity);
    const declaration = bilingualUnitServing(servingEvidence, true);
    if (!quantity || !declaration || quantity.count !== declaration.count
      || quantity.grams !== declaration.grams || quantity.grams !== servingSize) return false;
  }
  if (/\bunit\s*\/\s*unidad\b/i.test(header)) {
    const column = bilingualUnitServing(text(header).replace(/^per\s+/i, ''));
    const quantity = bilingualUnitServing(servingQuantity);
    const declaration = bilingualUnitServing(servingEvidence, true);
    return !!column && !!quantity && !!declaration && column.count === quantity.count
      && column.count === declaration.count && column.grams === quantity.grams
      && column.grams === declaration.grams && column.grams === servingSize;
  }
  if (/\b(?:per|por)\s*100\s*(?:g|grams?)\b|\bper\s*100g\b/.test(value)) return false;
  // A counted alternate column must match the declared count and unit, not just its noun.
  const countedHeader=printedServingCount(header,true)||printedServingCount(header);
  if(countedHeader && ['serving','portion','porcion','racion'].includes(countedHeader.unit))return countedHeader.count===1;
  if(countedHeader && !['g','gram','gramo'].includes(countedHeader.unit)) {
    const countedServing=printedServingCount(servingQuantity),countedEvidence=printedServingCount(servingEvidence);
    return !!countedServing && !!countedEvidence && countedHeader.count===countedServing.count && countedHeader.unit===countedServing.unit && countedHeader.count===countedEvidence.count && countedHeader.unit===countedEvidence.unit;
  }
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
  if(!/\bnet\s*(?:wt|weight)\b/i.test(text(p.net_weight_text))||/multipack|\bpack of\b|\d\s*[x\u00d7]/i.test(text(p.net_weight_text)))return null;
  const amounts=[...text(p.net_weight_text).matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/gi)];
  if(amounts.length!==1||Number(amounts[0][1])!==grams)return null;
  const columns=result.detected_columns;
  if(!Array.isArray(columns)||columns.length!==1||result.selected_basis!=='per_serving')return null;
  return {grams,identity:normalizeText(p.front_brand)+'|'+normalizeText(p.front_product_name),basis:'single_package_net_weight'};
}

function servingCountEvidence(result) {
  return result?.serving_mass_basis==='single_package_net_weight' && packageServingEvidence(result)
    ? text(result.package_evidence.serving_size_text) : text(result?.serving_size_evidence);
}

// Enum/boolean diagnostics only: no OCR text, images or product/profile payloads.
export function labelBasisDiagnostics(result) {
  const transcription=result?.transcription_diagnostics;
  return {...(['columns_v1','columns_v2'].includes(transcription?.schema)?{transcription_schema:transcription.schema,transcription_status:['adapted','identity_conflict','invalid_declaration_parts','invalid_schema','unclear','conflicting_fields','invalid_columns','duplicate_columns','multiple_matching_columns','declared_basis_unresolved','invalid_rows'].includes(transcription.status)?transcription.status:'invalid_schema',
    transcription_raw_column_count:Number.isInteger(transcription.raw_column_count)&&transcription.raw_column_count>=0&&transcription.raw_column_count<=7?transcription.raw_column_count:null,
    transcription_raw_column_count_capped:transcription.raw_column_count_capped===true,
    ...(transcription.schema==='columns_v2'?{transcription_declaration_parts:['absent','missing','invalid_object','missing_label','empty_label','unrecognized_label','label_contains_container_text','missing_value','empty_value','value_repeats_label','value_contains_container_text','recognized_parts'].includes(transcription.declaration_parts)?transcription.declaration_parts:'invalid_object'}:{}),
    transcription_declared_serving_grammar:DECLARED_SERVING_GRAMMAR_CLASSES.includes(transcription.declared_serving_grammar)?transcription.declared_serving_grammar:'invalid_type',
  }:{}),basis:['per_serving','per_100g'].includes(result?.selected_basis)?result.selected_basis:'unknown',
    mass_basis:result?.serving_mass_basis==='single_package_net_weight'?'single_package_net_weight':'label_grams',
    column_count:Array.isArray(result?.detected_columns)?Math.min(result.detected_columns.length,10):0,
    has_mass:typeof result?.serving_size_g==='number'&&result.serving_size_g>0,
    mass_from_declared_line:declaredServingMassFallback(result)!==null,
    selected_header_present:!!text(result?.selected_column_header),
    serving_header_association:result?.selected_basis==='per_serving' && !!text(result?.selected_column_header)
      ? columnMatchesServing(result.selected_column_header,resolvedServingMass(result),result.serving_quantity,servingCountEvidence(result)) : null,
    mass_value_type:result?.serving_size_g===null?'null':['number','string'].includes(typeof result?.serving_size_g)?typeof result.serving_size_g:'missing_or_other',
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
  const servingSize = per100 ? 100 : resolvedServingMass(result);
  const headerKey = !per100 && result.serving_size_g == null ? literalHeaderKey : normalizeText;
  const servingQuantity = per100 ? '100 g' : text(result.serving_quantity);
  const servingEvidence = per100 ? selectedColumn : servingCountEvidence(result);
  if (!selectedColumn || (!per100 && (selectedBasis !== 'per_serving' || !columnMatchesServing(selectedColumn, servingSize, servingQuantity, servingEvidence)))) return invalid('serving', 'basis_unclear');
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
    if (nutrient === 'fiber' && (row == null || typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0 || !canonicalUnit(row.unit,nutrient) || !labelMatches(nutrient,row.row_label) || !hasExactPrintedAmount(row.printed_text,row.value,nutrient) || headerKey(row.column_header)!==headerKey(selectedColumn))) { nutrients.fiber = { value: null, unit: null }; continue; }
    if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid(nutrient);
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) return invalid(nutrient);
    const unit = canonicalUnit(row.unit, nutrient);
    const rowLabel = text(row.row_label);
    const printedText = text(row.printed_text);
    const columnHeader = text(row.column_header);
    if (!unit || !rowLabel || !labelMatches(nutrient, rowLabel) || !printedText || !hasExactPrintedAmount(printedText, row.value, nutrient)) return invalid(nutrient, 'exact_amount_unclear');
    if (nutrient !== 'calories' && !/(?:^|\d)\s*(?:g|grams?|gm|gms)\b/i.test(printedText)) return invalid();
    if (!columnHeader || headerKey(columnHeader) !== headerKey(selectedColumn)) return invalid();
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
  if (['columns_v1','columns_v2'].includes(firstResult?.transcription_diagnostics?.schema) || ['columns_v1','columns_v2'].includes(secondResult?.transcription_diagnostics?.schema)) {
    // Preserve original headers across source-only semantic aliases, never log these strings.
    const sourceHeaderKey = value => literalHeaderKey(normalizeDeclaredColumnTypography(value));
    if (!['columns_v1','columns_v2'].includes(firstResult?.transcription_diagnostics?.schema) || firstResult?.transcription_diagnostics?.schema !== secondResult?.transcription_diagnostics?.schema ||
      !Array.isArray(firstResult.source_column_headers) || !Array.isArray(secondResult.source_column_headers) ||
      sourceHeaderKey(firstResult.source_selected_column_header) !== sourceHeaderKey(secondResult.source_selected_column_header) ||
      JSON.stringify(firstResult.source_column_headers.map(sourceHeaderKey).sort()) !== JSON.stringify(secondResult.source_column_headers.map(sourceHeaderKey).sort())) return invalid('serving', 'reads_disagree');
  }
  if (firstResult?.transcription_diagnostics?.schema === 'columns_v2') {
    const a=firstResult.source_declared_serving_parts,b=secondResult.source_declared_serving_parts;
    if(a===null||b===null){
      if(a!==null||b!==null||first.reading.selectedBasis!=='per_100g'||second.reading.selectedBasis!=='per_100g')return invalid('serving','reads_disagree');
    } else {
      if(!a||!b||typeof a.label_text!=='string'||typeof b.label_text!=='string'||typeof a.value_text!=='string'||typeof b.value_text!=='string'||
        literalHeaderKey(a.label_text)!==literalHeaderKey(b.label_text)||
        literalHeaderKey(normalizeDeclaredColumnTypography(a.value_text))!==literalHeaderKey(normalizeDeclaredColumnTypography(b.value_text)))return invalid('serving','reads_disagree');
    }
  }
  if (declaredServingMassFallback(firstResult) !== null || declaredServingMassFallback(secondResult) !== null) {
    // A recovered read cannot be confirmed by a numeric read whose old, looser
    // normalization erased a range/qualifier or hid an alternate column. Prove
    // each read separately with the strict literal path; never copy evidence.
    for (const [result, checked] of [[firstResult, first], [secondResult, second]]) {
      const literalOnly = { ...result, serving_size_g: null };
      if (declaredServingMassFallback(literalOnly) !== checked.reading.servingSize) return invalid('serving', 'reads_disagree');
      const strict = validateNutritionLabelRead(literalOnly);
      if (!strict.ok) return strict;
      checked.reading = strict.reading;
    }
    if (literalHeaderKey(firstResult.serving_quantity) !== literalHeaderKey(secondResult.serving_quantity)) return invalid('serving', 'reads_disagree');
  }
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

/**
 * Make at most two sequential reads. The second is never called unless the first is structurally valid.
 * These types describe the existing validation contract; they do not validate or authorize a read.
 * @param {(signal: AbortSignal) => Promise<{result: unknown, finishReason: string | null}>} primaryRead
 * @param {(signal: AbortSignal) => Promise<{result: unknown, finishReason: string | null}>} independentRead
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<({ok: false, message: string, issues: Array<{field: string, reason: string}>} | {ok: true, productName: string, brand: string | null, servingMassBasis: string, servingSize: number, servingQuantity: string, nutrition: {calories: number, protein: number, carbs: number, fat: number, fiber: number | null}}) & {calls: number, basis_diagnostics?: unknown}>}
 */
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
  const grams=per100?100:resolvedServingMass(result);
  const headerKey=!per100&&result.serving_size_g==null?literalHeaderKey:normalizeText;
  if (typeof grams!=='number'||!Number.isFinite(grams)||grams<=0) return null;
  if (!per100 && (result.selected_basis!=='per_serving'||!columnMatchesServing(header,grams,result.serving_quantity,servingCountEvidence(result))||!(result.serving_mass_basis==='single_package_net_weight'?packageServingEvidence(result):hasGramServingEvidence(result.serving_size_evidence,grams)))) return null;
  const nutrition={};
  for (const nutrient of NUTRIENTS) {
    const row=result.nutrients?.[nutrient];
    if (typeof row?.value==='number' && Number.isFinite(row.value) && row.value>=0 &&
      canonicalUnit(row.unit,nutrient) && labelMatches(nutrient,row.row_label) &&
      headerKey(row.column_header)===headerKey(header) && hasExactPrintedAmount(row.printed_text,row.value,nutrient)) nutrition[nutrient]=row.value;
  }
  return {serving_g:grams,serving:per100?'100 g':text(result.serving_quantity),nutrition};
}


