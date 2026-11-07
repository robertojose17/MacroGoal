import { candidateEligible, complete, conflictsWithPhoto, norm } from './recovery-contract.mjs';

// Fixed caps, never supplied by the client or model. A label attempt retains the
// existing two-read gate. No new search/provider and no retry of the same asset.
export const MAX_PRODUCT_IMAGES = 24;
export const MAX_LABEL_ATTEMPTS = 2;
export const MIN_LABEL_TIME_MS = 20000;
const labelHint = /\b(?:nutrition(?:al)?[\s_-]*(?:facts?|labels?|panels?|information)|nutritional[\s_-]*values)\b/i;
const resource = value => { try { const u = new URL(value); u.hash = ''; return u.href; } catch { return null; } };

/** Only Product.image is inspected. General page images, recommended products,
 * model-generated URLs and images from other Product records never enter here.
 * Image captions rank an already-bound asset; they are not nutrition evidence.
 */
export function productGallery(value, page, authorize) {
  const images = Array.isArray(value) ? value : [value];
  if (images.length > MAX_PRODUCT_IMAGES) return [];
  const found = new Map();
  for (const item of images) {
    const raw = typeof item === 'string' ? item : item?.url || item?.contentUrl;
    if (typeof raw !== 'string') continue;
    const allowed = authorize(raw, page), url = allowed && resource(allowed);
    if (!url) continue;
    const metadata = typeof item === 'object' && item
      ? [item.name, item.caption, item.description].filter(x => typeof x === 'string').map(x => x.slice(0, 240)).join(' ') : '';
    const hint = labelHint.test(metadata) || labelHint.test(new URL(url).pathname);
    const previous = found.get(url);
    if (previous) previous.label_hint ||= hint;
    else found.set(url, { url, label_hint: hint });
  }
  return [...found.values()];
}

/** Unknown alternate gallery images are considered only when structured
 * nutrition is incomplete. Bound hints may be checked against complete panels,
 * but an unavailable/unclear optional read cannot erase valid structured evidence.
 * @param {string|null} [boundManufacturerLabel]
 */
export function sourceLabelCandidates(row, suggestions, boundManufacturerLabel = null) {
  const images = Array.isArray(row.product_images) ? row.product_images : [];
  const allowed = new Set(images.map(resource));
  const hints = new Set((row.product_image_hints || []).map(resource));
  const suggested = new Set(suggestions.filter(x => typeof x === 'string').slice(0, 6).map(resource).filter(x => allowed.has(x)));
  const manufacturer = resource(boundManufacturerLabel);
  const front = resource(row.image_url);
  const needsNutrition = !(row.serving_g > 0 && norm(row.serving) && complete(row.nutrition));
  return images.map(resource).filter((url, index, all) => url && all.indexOf(url) === index)
    .map(url => ({ url, rank: url === manufacturer ? 0 : hints.has(url) ? 1 : suggested.has(url) ? 2 : 3,
      kind: url === manufacturer ? 'manufacturer_panel' : hints.has(url) ? 'bound_gallery_hint' : suggested.has(url) ? 'provider_bound_gallery' : 'bound_gallery_alternate' }))
    .filter(item => item.rank < 3 || (needsNutrition && item.url !== front))
    .sort((a, b) => a.rank - b.rank).slice(0, MAX_PRODUCT_IMAGES);
}

const validReading = reading => reading?.ok === true && typeof reading.servingSize === 'number' && Number.isFinite(reading.servingSize)
  && reading.servingSize > 0 && norm(reading.servingQuantity) && complete(reading.nutrition);
const readingEvidence = reading => ({ serving_g: reading.servingSize, nutrition: reading.nutrition });
const comparableEvidence = evidence => evidence && ({ serving_g: evidence.serving_g, nutrition: evidence.nutrition });
const addConflicts = (row, conflicts) => {
  if (conflicts.length) { row.conflicts = [...new Set([...(row.conflicts || []), ...conflicts])]; row.label_issue = 'label_conflict'; }
};

/** Sequential, request-wide two-attempt budget. No parallel provider calls.
 * Caller passes the original deadline and existing receipt-wrapped reader.
 * Partial evidence may veto later reads, but can never fill their missing data.
 */
export async function recoverSourceLabels(work, barcode, deps, diagnostics, describeFailure) {
  // A later phase must not erase or retry uncertain/conflicting/partial work.
  if (deps.budget?.uncertain || deps.budget?.provider_blocked || deps.budget?.evidence_conflict || deps.budget?.unresolved_partial_evidence) return deps.budget?.label_attempts || 0;
  const jobs = [];
  for (const entry of work) {
    if (entry.row.provenance?.kind === 'source_label' && candidateEligible(entry.row, barcode)) continue;
    // Only exact-code, strongly hinted assets outrank the optional text reader.
    // Provider suggestions and unknown gallery alternates keep the old fallback.
    const labels = deps.priorityOnly ? entry.labels.filter(label => entry.row.exact_barcode && entry.row.barcode_evidence === 'matching' && label.rank <= 1) : entry.labels;
    if (!labels.length || !['matching', 'absent'].includes(entry.row.barcode_evidence)) continue;
    entry.partial ||= [];
    // Preserve already-eligible source evidence while optional artwork is checked.
    // Explicit observed conflicts below still veto it; incomplete panels get no fallback.
    if (!Object.hasOwn(entry, 'structuredEvidence')) entry.structuredEvidence = entry.row.provenance?.kind === 'source_record' && candidateEligible(entry.row, barcode)
      ? { validated: entry.row.validated, nutrition_validated: entry.row.nutrition_validated } : null;
    entry.row.validated = false;
    entry.row.nutrition_validated = false;
    entry.row.label_issue = 'label_not_checked';
    for (const label of labels) jobs.push({ entry, label });
  }
  jobs.sort((a, b) => Number(b.entry.row.exact_barcode) - Number(a.entry.row.exact_barcode) || a.label.rank - b.label.rank || a.entry.slot - b.entry.slot);
  const attempted = deps.budget?.attempted_labels || new Set();
  let attempts = deps.budget?.label_attempts || 0;
  for (const { entry, label } of jobs) {
    const { row, slot, host } = entry;
    if (deps.budget?.uncertain || deps.budget?.provider_blocked || work.some(item => item.row.conflicts?.length)) break;
    if (candidateEligible(row, barcode) || row.conflicts?.length) continue;
    if (work.some(item => candidateEligible(item.row, barcode))) break;
    if (attempted.has(label.url)) continue;
    const reason = !deps.readLabel ? 'reader_unavailable' : attempts >= MAX_LABEL_ATTEMPTS ? 'read_limit'
      : deps.deadline - Date.now() < MIN_LABEL_TIME_MS ? 'request_deadline' : null;
    if (reason) { diagnostics.push({ slot, host, outcome: 'source_label_not_checked', reason }); break; }
    attempts++;
    if (deps.budget) deps.budget.label_attempts = attempts;
    attempted.add(label.url);
    let reading;
    try { reading = await deps.readLabel(label.url, row.image_url, row.brand + ' ' + row.name); }
    catch { if (deps.budget) deps.budget.uncertain = true; reading = { ok: false, issues: [{ field: 'analysis', reason: 'analysis_unavailable' }] }; }
    if (deps.budget && (!reading || (reading.ok !== true && (!Array.isArray(reading.issues) || reading.issues.some(issue => issue?.reason === 'analysis_unavailable'))))) deps.budget.uncertain = true;
    row.label_issue = 'label_unreadable';
    if (reading?.partialEvidence) { entry.partial.push(reading.partialEvidence); if (deps.budget && reading.ok !== true) deps.budget.unresolved_partial_evidence = true; }
    if (validReading(reading)) {
      const evidence = readingEvidence(reading);
      // Do not quietly replace an existing complete source panel with different
      // values, or wash away a contradiction from an earlier readable fragment.
      if (row.serving_g > 0) addConflicts(row, conflictsWithPhoto({serving_g:evidence.serving_g,nutrition:evidence.nutrition}, comparableEvidence(row)));
      const readCandidate = { serving_g: evidence.serving_g, serving: evidence.serving, nutrition: evidence.nutrition };
      for (const observed of work) for (const partial of observed.partial || []) {
        // Shared discovery passes must not erase an already observed same-code
        // partial panel. Unbound identity or mass cannot safely be compared.
        if (observed !== entry && (observed.row.barcode_evidence !== 'matching' || row.barcode_evidence !== 'matching' || !(partial.serving_g > 0))) addConflicts(row, ['label']);
        else addConflicts(row, conflictsWithPhoto(readCandidate, comparableEvidence(partial)));
      }
      if (!row.conflicts?.length) {
        row.nutrition = reading.nutrition;
        row.serving_g = reading.servingSize;
        row.serving = reading.servingQuantity;
        row.nutrition_image_url = label.url;
        row.nutrition_validated = true;
        row.validated = row.exact_barcode;
        row.provenance = { ...row.provenance, kind: 'source_label', basis: 'two_independent_source_label_reads', label_discovery: label.kind };
        delete row.label_issue;
        diagnostics.push({ slot, host, outcome: 'source_label_verified', attempt: attempts, discovery: label.kind });
      } else diagnostics.push({ slot, host, outcome: 'source_label_conflict', attempt: attempts });
    } else {
      if (reading?.partialEvidence && row.serving_g > 0) addConflicts(row, conflictsWithPhoto(row, comparableEvidence(reading.partialEvidence)));
      const disagreements = (Array.isArray(reading?.issues) ? reading.issues : []).filter(issue => issue?.reason === 'reads_disagree').map(issue => ['serving','serving_g','calories','protein','carbs','fat','fiber'].includes(issue.field) ? issue.field : 'label');
      addConflicts(row, disagreements);
      // The existing gate also uses identity_unclear for an explicit match=false.
      // It cannot safely be treated as mere unreadability, even for a complete panel.
      if (Array.isArray(reading?.issues) && reading.issues.some(issue => issue?.reason === 'identity_unclear')) addConflicts(row, ['label']);
      diagnostics.push({ slot, host, outcome: 'source_label_rejected', attempt: attempts, ...describeFailure(reading) });
    }
  }
  if (deps.budget && work.some(entry => entry.row.conflicts?.length)) deps.budget.evidence_conflict = true;
  for (const entry of work) {
    const { row, structuredEvidence } = entry;
    if (structuredEvidence && row.provenance?.kind === 'source_record' && !row.conflicts?.length) {
      row.validated = structuredEvidence.validated;
      row.nutrition_validated = structuredEvidence.nutrition_validated;
      delete row.label_issue;
    }
  }
  return attempts;
}
