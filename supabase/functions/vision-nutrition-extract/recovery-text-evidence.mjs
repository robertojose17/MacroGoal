import { candidateEligible, validBarcode } from './recovery-contract.mjs';
import { sameBarcode } from './identity.mjs';
import { literalServingGrams } from './serving-mass.mjs';

// This module is NOT a fetch-result authenticator. The caller must select receipt
// from a successful provider's separately typed web_fetch tool output, never from
// model prose, a model extraction object, or client input. No source is fetched,
// persisted, or logged here. All offsets refer to the original UTF-16 content.
export const TEXT_EVIDENCE_EXTRACTION_INSTRUCTIONS = `Return only one JSON extraction proposal with source_url, name, brand, variant, barcode, serving, serving_g, nutrition, evidence. Nutrition has calories, protein, carbs, fat and fiber (null if absent). Evidence has name, brand, variant, barcode, serving, basis, panel, calories, protein, carbs, fat and fiber (null if absent). Each evidence value is {quote,start,end}: literal exact fetched-source text, UTF-16 start and exclusive end offsets. If offsets are uncertain omit BOTH offsets; the exact quote must occur exactly once. Identity and nutrient quotes must be complete source rows, either one line or a label immediately followed by its value on the next line, never disconnected words or numeric substrings. Panel must be one contiguous complete nutrition panel beginning with its nutrition heading. Require explicit brand, literal serving grams and an explicit per-serving basis. If a barcode is published it must be labelled and match the requested barcode. Only when no barcode/code marker is present at all, use barcode:null and evidence.barcode:null; user identity confirmation is then mandatory. Never infer a missing field, convert units, combine panels/pages, use per-100g values or select a column from an ambiguous label. Variant may equal the full published name, using the same name quote. Unsupported or incomplete sources yield null.`;

const CORE = ['calories', 'protein', 'carbs', 'fat'];
const FIELDS = [...CORE, 'fiber'];
const ROOT_KEYS = ['source_url', 'name', 'brand', 'variant', 'barcode', 'serving', 'serving_g', 'nutrition', 'evidence'];
const EVIDENCE_KEYS = ['name', 'brand', 'variant', 'barcode', 'serving', 'basis', 'panel', ...FIELDS];
const quoteSchema = {
  type: 'object', additionalProperties: false, required: ['quote'],
  description: 'One unique literal whole source line (panel: one contiguous complete panel). Optional UTF-16 start/end must both be supplied and exact.',
  properties: { quote: { type: 'string', minLength: 1, maxLength: 12000 }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } },
  dependentRequired: { start: ['end'], end: ['start'] },
};
export const TEXT_EVIDENCE_PROPOSAL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ROOT_KEYS,
  description: TEXT_EVIDENCE_EXTRACTION_INSTRUCTIONS,
  properties: {
    source_url: { type: 'string', description: 'Exact fetched receipt URL.' },
    name: { type: 'string', maxLength: 160 }, brand: { type: 'string', maxLength: 100 },
    variant: { type: 'string', maxLength: 160, description: 'Exact explicit variant, or the complete product name if no explicit variant line exists.' },
    barcode: { type: ['string', 'null'], pattern: '^(?:[0-9]{8}|[0-9]{12,14})$' },
    serving: { type: 'string', maxLength: 160, description: 'Literal source serving description without its Serving size label.' },
    serving_g: { type: 'number', exclusiveMinimum: 0 },
    nutrition: { type: 'object', additionalProperties: false, required: FIELDS,
      properties: Object.fromEntries(FIELDS.map(field => [field, { type: field === 'fiber' ? ['number', 'null'] : 'number', minimum: 0 }])) },
    evidence: { type: 'object', additionalProperties: false, required: EVIDENCE_KEYS,
      properties: Object.fromEntries(EVIDENCE_KEYS.map(field => [field, ['fiber', 'barcode'].includes(field) ? { anyOf: [quoteSchema, { type: 'null' }] } : quoteSchema])) },
  },
};
const NUM = '(?:0|[1-9]\\d{0,4})(?:[.,]\\d{1,2})?';
const decimal = value => Number(value.replace(',', '.'));
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const fail = reason => ({ ok: false, reason });
const folded = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compact = value => value.trim().replace(/\s+/g, ' ');
const sameText = (a, b) => typeof a === 'string' && compact(a) === compact(b);
const safeText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\r\n\x00-\x1f\x7f<>]/.test(value) && value === compact(value);
const LABELS = {
  calories: '(?:calories|calorias|energy|energie|energia)',
  protein: '(?:protein|proteins|proteine|proteines|proteina|proteinas)',
  carbs: '(?:total carbohydrate|total carbohydrates|carbohydrate|carbohydrates|carbohidratos(?: totales)?|hidratos de carbono|glucides)',
  fat: '(?:total fat|fat|grasas?(?: totales?)?|matieres grasses|lipides)',
  fiber: '(?:dietary fib(?:er|re)|fib(?:er|re)|fibras?(?: dieteticas?)?|fibres alimentaires)',
};
const prefixes = Object.fromEntries(FIELDS.map(field => [field, new RegExp('^' + LABELS[field] + '(?=\\s|:|$)', 'i')]));
const headingPattern = /^(?:nutrition facts|nutrition information|nutritional information|informacion nutricional|informacion nutrimental|valeurs nutritionnelles|declaration nutritionnelle)\s*:?$/;
const basisPattern = /^(?:amount per serving|per serving|amount per portion|per portion|cantidad por porcion|por porcion|por racion|quantite par portion|par portion)\s*:?$/;
const servingPrefix = /^(?:serving size|serving|tama[ñn]o de (?:la )?porci[oó]n|porci[oó]n|raci[oó]n|taille (?:de la|d'une) portion|portion)(?:\s*:\s*|\s+)/;
const namePrefix = /^(?:product name|product|name|nombre del producto|producto|nom du produit|produit)\s*:\s*/i;
const brandPrefix = /^(?:brand|marca|marque)\s*:\s*/i;
const variantPrefix = /^(?:variant|flavour|flavor|variedad|sabor|variante|saveur)\s*:\s*/i;
// Identifier presence is broader than identifier acceptance. Expanded labels,
// punctuation and spaced digits must never let a proposal call a published code
// absent. Values still need one literal, checksum-valid identifier to be accepted.
const BARCODE_LABEL = '(?:u[.\\s_-]*p[.\\s_-]*c(?:[.\\s_-]*a)?|e[.\\s_-]*a[.\\s_-]*n(?:[.\\s_-]*(?:8|13))?|g[.\\s_-]*t[.\\s_-]*i[.\\s_-]*n(?:[.\\s_-]*(?:8|12|13|14))?|bar[\\s_-]*code|universal[\\s_-]*product[\\s_-]*code|(?:international|european)[\\s_-]*article[\\s_-]*number|global[\\s_-]*trade[\\s_-]*item[\\s_-]*number|gs[\\s_-]*1|codigo[\\s_-]*de[\\s_-]*barras|code[\\s_-]*barres)';
const barcodePrefix = new RegExp('^' + BARCODE_LABEL + '(?:\\s*:\\s*|\\s+)', 'i');
// A boundary is recognized from the source itself, never selected by the model.
// Only exact, standalone recommendation/review/footer headings end the primary
// product. An arbitrary subsection or product heading cannot create a new scope.
const primaryBoundary = /^(?:related products|recommended products|you may also like|customers also (?:bought|viewed)|recently viewed|customer reviews|ratings (?:and|&) reviews|reviews|footer|productos relacionados|produits similaires)\s*:?$/;
const harmlessBridge = /^(?:product details|product information|details|specifications|nutrition (?:and|&) ingredients|nutrition|informacion del producto|detalles|informations produit)\s*:?$/;
const nextSection = /^(?:ingredients|allergens?|allergen information|directions|storage|warnings|product details|product information|specifications|description|ingredientes|alergenos|instructions|conservation)\s*:?$/;
const barcodeRow = new RegExp('^' + BARCODE_LABEL + '(?:\\s*:\\s*|\\s+)(\\d{8}|\\d{12,14})$', 'i');

function publicSourceURL(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || !u.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return null;
    return u.href;
  } catch { return null; }
}

// Modest presentation normalization only. Evidence still matches the original
// bytes/string. Markdown tables are limited to label / one amount / optional DV.
function presentation(raw) {
  let value = raw.trim().replace(/^#{1,6}\s+/, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1');
  if (value.includes('|')) {
    const cells = value.replace(/^\|/, '').replace(/\|$/, '').split('|').map(compact);
    if (cells.length > 3 || cells.some(cell => !cell)) return null;
    value = cells.join(' ');
  }
  return compact(value);
}
function sourceLines(content) {
  let offset = 0;
  return content.split('\n').map(raw => {
    const start = offset + raw.length - raw.trimStart().length;
    const quote = raw.trim();
    offset += raw.length + 1;
    return { start, end: start + quote.length, quote, text: presentation(quote) };
  }).filter(line => line.quote);
}
// Some extraction transports preserve row adjacency but split cells onto lines.
// Join only a recognized label immediately followed by its value. Never join two
// arbitrary fragments, skip text, or select an amount from multiple columns.
function sourceRows(content, physical) {
  const rows = [];
  for (let i = 0; i < physical.length; i++) {
    const line = physical[i], next = physical[i + 1];
    const label = folded(line.text || '').replace(/:$/, '');
    const identity = /^(?:product name|product|name|nombre del producto|producto|nom du produit|produit|brand|marca|marque|variant|flavour|flavor|variedad|sabor|variante|saveur|upc(?:-a)?|ean(?:-\d{1,2})?|gtin(?:-?\d{1,2})?|barcode|codigo de barras|code-barres)$/.test(label);
    const serving = /^(?:serving size|serving|tamano de (?:la )?porcion|porcion|racion|taille (?:de la|d'une) portion|portion)$/.test(label);
    const nutrient = FIELDS.some(field => new RegExp('^' + LABELS[field] + '$').test(label));
    if ((identity || serving || nutrient) && next?.text && !/^#{1,6}\s/.test(next.quote) && !next.text.includes(':') && !headingPattern.test(folded(next.text)) && !basisPattern.test(folded(next.text))) {
      rows.push({ start: line.start, end: next.end, quote: content.slice(line.start, next.end), text: line.text.replace(/:$/, '') + ': ' + next.text });
      i++;
    } else rows.push(line);
  }
  return rows;
}
function resolveSpan(content, span, max = 12000) {
  if (!onlyKeys(span, ['quote', 'start', 'end']) || typeof span.quote !== 'string' || !span.quote || span.quote.length > max) return null;
  const first = content.indexOf(span.quote);
  // A unique quote is mandatory even when a model supplies offsets. Offsets must
  // not be a way to select one of duplicated products, values or panels.
  if (first < 0 || first !== content.lastIndexOf(span.quote)) return null;
  const hasStart = Object.hasOwn(span, 'start'), hasEnd = Object.hasOwn(span, 'end');
  if (hasStart !== hasEnd || (hasStart && (!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start !== first || span.end !== first + span.quote.length))) return null;
  return { quote: span.quote, start: first, end: first + span.quote.length };
}
function wholeLine(lines, span) {
  return span && lines.find(line => line.start === span.start && line.end === span.end) || null;
}
function parseNutrient(line) {
  if (!line.text) return null;
  const text = folded(line.text);
  const field = FIELDS.find(key => prefixes[key].test(text));
  if (!field) return null;
  const rest = text.replace(prefixes[field], '').trim().replace(/^:\s*/, '');
  // Calories without an explicit unit is the established label meaning; Energy
  // needs explicit kcal. kJ, mg, unit conversion, qualifiers and multiple numeric
  // columns are never accepted as an equivalent source amount.
  const calorieLabel = /^(?:calories|calorias)(?=\s|:|$)/.test(text);
  const unit = field === 'calories' ? (calorieLabel ? '(?:\\s*(?:kcal|calories|calorias))?' : '\\s*kcal') : '\\s*(?:g|grams?|gramos?|grammes?)';
  const match = new RegExp('^(' + NUM + ')' + unit + '(?:\\s+(' + NUM + ')\\s*%\\*?)?$').exec(rest);
  if (!match || (field === 'calories' && match[2] !== undefined)) return { field, invalid: true };
  return { field, value: decimal(match[1]) };
}
function auxiliaryLine(text) {
  const t = folded(text);
  if (/^(?:%\s*(?:daily value|dv|valor diario|valeur quotidienne)\*?|(?:nutrient|nutriment)\s+amount(?:\s+%\s*(?:dv|daily value)\*?)?)$/.test(t)) return true;
  if (/^(?:\|?\s*:?-{3,}:?\s*)+$/.test(t)) return true;
  if (new RegExp('^(?:' + NUM + '\\s+servings? per container|servings? per container\\s*:?\\s*' + NUM + ')$').test(t)) return true;
  const auxiliary = '(?:saturated fat|trans fat|cholesterol|sodium|total sugars|sugars|added sugars|potassium|calcium|iron|vitamin [a-z](?:[0-9]{1,2})?|salt|saturates|azucares(?: totales)?|grasas saturadas|sodio|sal|dont acides gras satures|dont sucres|sucres)';
  if (new RegExp('^' + auxiliary + '\\s*:?\\s*' + NUM + '\\s*(?:g|mg|mcg|ug|µg)(?:\\s+' + NUM + '\\s*%\\*?)?$').test(t)) return true;
  if (new RegExp('^includes\\s+' + NUM + '\\s*g\\s+added sugars(?:\\s+' + NUM + '\\s*%\\*?)?$').test(t)) return true;
  // Only the standard explanatory footer, not arbitrary prose or another panel.
  return /^\*?\s*(?:the % daily value|percent daily values|% daily value)\b[^<>]*$/.test(t) && !/\b(?:per\s*100|prepared|unprepared)\b/.test(t);
}
async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function validateFetchedTextEvidence(receipt, proposal, barcode) {
  if (!validBarcode(barcode)) return fail('invalid_barcode');
  const url = publicSourceURL(receipt?.url);
  if (!object(receipt) || receipt.type !== 'openrouter:web_fetch' || !url || !Number.isInteger(receipt.httpStatus) || receipt.httpStatus < 200 || receipt.httpStatus >= 300 || receipt.status !== 'completed' || receipt.truncated === true || receipt.error != null) return fail('unverified_fetch_receipt');
  const content = receipt.content;
  if (typeof content !== 'string' || !content.trim() || content.length > 120000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content) || /<(?:html|script|table|div)\b/i.test(content)) return fail('unsupported_source_text');
  if (!onlyKeys(proposal, ROOT_KEYS) || ROOT_KEYS.some(key => !Object.hasOwn(proposal, key)) || proposal.source_url !== receipt.url || publicSourceURL(proposal.source_url) !== url || !onlyKeys(proposal.nutrition, FIELDS) || !onlyKeys(proposal.evidence, EVIDENCE_KEYS)) return fail('invalid_proposal');
  const absentBarcode = proposal.barcode === null;
  if (absentBarcode && proposal.evidence.barcode !== null) return fail('invalid_proposal');
  if (!safeText(proposal.name, 160) || !safeText(proposal.brand, 100) || !safeText(proposal.variant, 160) || !safeText(proposal.serving, 160) || (!absentBarcode && (!validBarcode(proposal.barcode) || !sameBarcode(proposal.barcode, barcode)))) return fail('identity_mismatch');
  if (CORE.some(key => typeof proposal.nutrition[key] !== 'number' || !Number.isFinite(proposal.nutrition[key]) || proposal.nutrition[key] < 0) || (proposal.nutrition.fiber != null && (typeof proposal.nutrition.fiber !== 'number' || !Number.isFinite(proposal.nutrition.fiber) || proposal.nutrition.fiber < 0))) return fail('invalid_nutrition_proposal');
  const physicalLines = sourceLines(content);
  const boundary = physicalLines.find(line => primaryBoundary.test(folded(line.text || '')));
  const scopeEnd = boundary?.start ?? content.length;
  const scopeContent = content.slice(0, scopeEnd);
  const lines = sourceRows(content, physicalLines.filter(line => line.end <= scopeEnd));
  const spans = {};
  for (const key of EVIDENCE_KEYS) {
    if (key === 'barcode' && absentBarcode) continue;
    if (key === 'fiber' && proposal.nutrition.fiber == null && proposal.evidence.fiber == null) continue;
    spans[key] = resolveSpan(scopeContent, proposal.evidence[key], key === 'panel' ? 12000 : 500);
    if (!spans[key]) return fail('invalid_source_quote');
  }
  const panel = spans.panel;
  if (!lines.some(line => line.start === panel.start) || !lines.some(line => line.end === panel.end)) return fail('partial_panel');
  const panelLines = lines.filter(line => line.start >= panel.start && line.end <= panel.end);
  if (!panelLines.length || !headingPattern.test(folded(panelLines[0].text || ''))) return fail('missing_panel_heading');
  if (lines.filter(line => headingPattern.test(folded(line.text || ''))).length !== 1) return fail('multiple_panels');
  // Fail closed rather than guess which column, product state, or page section
  // applies. This intentionally excludes dual-basis and prepared-food panels.
  if (/\b(?:per|por|par)\s*(?:cada\s*)?100\s*(?:g|grams?|gramos?|ml)\b|\bas\s+(?:prepared|packaged|sold)\b|\b(?:unprepared|dry mix|after preparation|tal como se prepara)\b/i.test(folded(scopeContent)) || /\b(?:prepared|cooked|preparado|cocinado|prepare|cuit)\b/.test(folded(panel.quote))) return fail('ambiguous_nutrition_basis');
  const sourceCodes = [...scopeContent.matchAll(/(?<!\d)(?:\d{8}|\d{12,14})(?!\d)/g)].map(match => match[0]);
  const markerText = folded(scopeContent).replace(/\p{Cf}/gu, '');
  const codeMarkerCount = [...markerText.matchAll(new RegExp('\\b' + BARCODE_LABEL + '\\b', 'gi'))].length;
  const codeMarkers = codeMarkerCount > 0;
  const codeLines = lines.filter(line => barcodePrefix.test(folded(line.text || '')));
  const codeLine = absentBarcode ? null : wholeLine(lines, spans.barcode);
  const code = absentBarcode ? null : barcodeRow.exec(folded(codeLine?.text || ''))?.[1];
  if (absentBarcode) {
    // Absence is not a repair for a conflicting, invalid, unreadable or unbound
    // published identifier. The established UI must ask the user to bind it.
    if (sourceCodes.length || codeMarkers || codeLines.length) return fail('published_barcode_cannot_be_absent');
  } else {
    if (codeMarkerCount !== 1 || sourceCodes.length !== 1 || !validBarcode(sourceCodes[0]) || !sameBarcode(sourceCodes[0], barcode)) return fail('ambiguous_or_conflicting_barcode');
    if (codeLines.length !== 1 || codeLine !== codeLines[0] || code !== proposal.barcode || !sameBarcode(code, barcode)) return fail('unbound_barcode');
  }
  const nameLine = wholeLine(lines, spans.name), brandLine = wholeLine(lines, spans.brand), variantLine = wholeLine(lines, spans.variant);
  if (!nameLine?.text || !brandLine?.text || !variantLine?.text) return fail('unbound_identity');
  const namedLines = lines.filter(line => namePrefix.test(folded(line.text || '')));
  const h1Lines = lines.filter(line => /^#\s+/.test(line.quote));
  if (namedLines.length > 1 || h1Lines.length > 1 || lines.filter(line => brandPrefix.test(folded(line.text || ''))).length !== 1 || lines.filter(line => variantPrefix.test(folded(line.text || ''))).length > 1) return fail('multiple_product_context');
  const parsedName = namePrefix.test(folded(nameLine.text)) ? nameLine.text.replace(namePrefix, '') : nameLine.text;
  if ([...namedLines, ...h1Lines].some(line => !sameText(line.text.replace(namePrefix, ''), proposal.name))) return fail('conflicting_product_identity');
  const titleMatches = typeof receipt.title === 'string' && (sameText(receipt.title, parsedName) || [' | ', ' - ', ' – '].some(separator => receipt.title.startsWith(parsedName + separator) && receipt.title.length <= parsedName.length + 100));
  const anchoredName = namePrefix.test(folded(nameLine.text)) || /^#\s+/.test(nameLine.quote) || titleMatches;
  if (!anchoredName || !sameText(proposal.name, parsedName) || !brandPrefix.test(folded(brandLine.text)) || !sameText(proposal.brand, brandLine.text.replace(brandPrefix, ''))) return fail('unbound_identity');
  const variantFromName = variantLine === nameLine && proposal.variant === proposal.name;
  if (variantFromName && lines.some(line => variantPrefix.test(folded(line.text || '')))) return fail('unbound_variant');
  if (!variantFromName && (!variantPrefix.test(folded(variantLine.text)) || !sameText(proposal.variant, variantLine.text.replace(variantPrefix, '')))) return fail('unbound_variant');
  // Identity belongs to the same nearby product section before this one panel.
  if ([nameLine, brandLine, variantLine, codeLine].filter(Boolean).some(line => line.end >= panel.start || panel.start - line.start > 4000)) return fail('disconnected_identity');
  const identityRows = new Set([nameLine, brandLine, variantLine, codeLine].filter(Boolean));
  const identityStart = Math.min(...[...identityRows].map(line => line.start));
  const bridge = lines.filter(line => line.start >= identityStart && line.end < panel.start);
  if (bridge.some(line => !identityRows.has(line) && !harmlessBridge.test(folded(line.text || '')))) return fail('unbound_product_panel');
  const basisLines = lines.filter(line => basisPattern.test(folded(line.text || '')));
  const servingLines = lines.filter(line => servingPrefix.test(folded(line.text || '')));
  const basisLine = wholeLine(lines, spans.basis), servingLine = wholeLine(lines, spans.serving);
  if (basisLines.length !== 1 || basisLine !== basisLines[0] || !panelLines.includes(basisLine) || servingLines.length !== 1 || servingLine !== servingLines[0] || !panelLines.includes(servingLine)) return fail('unbound_serving_basis');
  const servingText = servingLine.text.replace(new RegExp(servingPrefix.source, 'i'), '');
  const servingShape = new RegExp('^(?:' + NUM + '\\s*g|(?:' + NUM + '|[1-9]\\d?/[1-9]\\d?|[1-9]\\d? [1-9]\\d?/[1-9]\\d?)\\s+[\\p{L}][\\p{L} \\-]{0,60}\\s*\\(' + NUM + '\\s*g\\))$', 'iu');
  const grams = servingShape.test(servingText) && !/\b(?:and|or|each|per|total|combined|y|cada|et|par)\b/i.test(servingText) ? literalServingGrams(servingText) : null;
  if (!sameText(proposal.serving, servingText) || grams === null || proposal.serving_g !== grams) return fail('serving_grams_mismatch');
  const parsed = lines.map(line => ({ line, result: parseNutrient(line) })).filter(row => row.result);
  const nutrition = {};
  for (const field of FIELDS) {
    const rows = parsed.filter(row => row.result.field === field);
    if (field === 'fiber' && !rows.length && proposal.nutrition.fiber == null && !spans.fiber) { nutrition.fiber = null; continue; }
    if (rows.length !== 1 || rows[0].result.invalid || !panelLines.includes(rows[0].line) || wholeLine(lines, spans[field]) !== rows[0].line || proposal.nutrition[field] !== rows[0].result.value) return fail('nutrient_evidence_mismatch');
    nutrition[field] = rows[0].result.value;
  }
  const knownLines = new Set([panelLines[0], servingLine, basisLine, ...parsed.map(row => row.line)]);
  if (panelLines.some(line => !knownLines.has(line) && (!line.text || !auxiliaryLine(line.text)))) return fail('unsupported_panel_line');
  // Do not let the proposal omit a qualifier immediately after its chosen
  // panel. A later unrelated section must have its own explicit section heading.
  const following = lines.find(line => line.start > panel.end);
  if (following && !nextSection.test(folded(following.text || ''))) return fail('partial_panel');
  // Bind compact metadata to the page URL, full extracted source and each exact
  // evidence span. Raw content/quotes are deliberately absent from the candidate.
  const sourceHash = await digest(url + '\n' + content);
  const evidenceHashes = {};
  for (const [field, span] of Object.entries(spans)) evidenceHashes[field] = await digest(sourceHash + '\n' + field + '\n' + span.start + ':' + span.end + '\n' + span.quote);
  const candidate = {
    name: proposal.name, brand: proposal.brand, variant: proposal.variant,
    barcode: code, barcode_evidence: absentBarcode ? 'absent' : 'matching', exact_barcode: !absentBarcode,
    serving: servingText, serving_g: grams, nutrition,
    nutrition_validated: true, validated: !absentBarcode, image_url: null, nutrition_image_url: null,
    product_images: [], product_image_hints: [], confidence: absentBarcode ? 'identity_unconfirmed' : 'published_barcode',
    provenance: { kind: 'source_record', url, retrieved_at: new Date().toISOString(),
      basis: 'single_product_fetched_text_panel', identity: absentBarcode ? 'source_barcode_absent' : 'published_gtin',
      source_type: 'openrouter:web_fetch', evidence_version: 1,
      source_text_sha256: sourceHash, primary_scope_end: scopeEnd, evidence_sha256: evidenceHashes },
  };
  return candidateEligible(candidate, barcode) ? { ok: true, candidate } : fail('candidate_ineligible');
}
