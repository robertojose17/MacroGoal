import { canonicalBarcode, sameBarcode } from './identity.mjs';

export const FIELDS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
export const REQUIRED_FIELDS = ['calories', 'protein', 'carbs', 'fat'];
const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const complete = n => !!n && REQUIRED_FIELDS.every(k => numeric(n[k])) && (n.fiber == null || numeric(n.fiber));
export const norm = s => typeof s === 'string' ? s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
export function validBarcode(s) {
  if (typeof s !== 'string' || !/^(?:\d{8}|\d{12,14})$/.test(s)) return false;
  let sum = 0;
  for (let i = s.length - 2, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += Number(s[i]) * weight;
  return (10 - sum % 10) % 10 === Number(s.at(-1));
}
// Nutrition evidence and source identity are separate authorities.
export function barcodeEvidence(c, barcode) {
  if(c?.barcode_evidence==='invalid'||c?.barcode_evidence==='conflicting')return c.barcode_evidence;
  if(c?.barcode==null)return 'absent';
  return !validBarcode(c.barcode)?'invalid':sameBarcode(c.barcode,barcode)?'matching':'conflicting';
}
export function candidateEligible(c, barcode) {
  if(!c||!validBarcode(barcode)||!norm(c.name)||!norm(c.brand)||!norm(c.variant)||
    typeof c.serving_g!=='number'||!Number.isFinite(c.serving_g)||c.serving_g<=0||!norm(c.serving)||!complete(c.nutrition)||
    c.label_issue||c.conflicts?.length)return false;
  const kind=c.provenance?.kind, evidence=barcodeEvidence(c,barcode);
  if(kind==='physical_label')return evidence==='matching'&&c.validated===true;
  if(!['source_record','source_label'].includes(kind))return false;
  if(evidence==='matching')return c.nutrition_validated===true||c.validated===true;
  // Only explicitly classified absence can be bridged by user confirmation.
  return evidence==='absent'&&c.barcode_evidence==='absent'&&c.nutrition_validated===true;
}
// Keep conflicting sources separate; identical identity AND values can be de-duplicated.
export function distinctCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = JSON.stringify([canonicalBarcode(c.barcode || ''), norm(c.name), norm(c.brand), norm(c.variant), c.serving_g, c.nutrition]);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3);
}
export function conflictsWithPhoto(candidate, photo) {
  if (!photo?.nutrition || !photo.serving_g) return [];
  const fields = FIELDS.filter(k => typeof photo.nutrition[k] === 'number' && typeof candidate.nutrition[k] === 'number' && Math.abs(candidate.nutrition[k] / candidate.serving_g - photo.nutrition[k] / photo.serving_g) > 0.000001);
  if (candidate.serving_g !== photo.serving_g || (photo.serving && norm(candidate.serving) !== norm(photo.serving))) fields.unshift('serving');
  return fields;
}
export function confirmationPayload(candidate, binding, confirmations) {
  if (!candidateEligible(candidate, binding.barcode)) throw Error('identity_or_nutrition_unverified');
  if (!confirmations || confirmations.identity !== true || confirmations.serving !== true || confirmations.nutrition !== true || confirmations.shared !== true) throw Error('confirmation_required');
  const userBound=barcodeEvidence(candidate,binding.barcode)==='absent';
  return {
    barcode: canonicalBarcode(binding.barcode), expected_id: binding.id || null, expected_updated_at: binding.updated_at || null,
    name: candidate.name, brand: candidate.brand, variant: candidate.variant,
    serving_size: candidate.serving_g, serving_quantity: candidate.serving,
    ...candidate.nutrition, fiber:candidate.nutrition.fiber ?? null, image_url:candidate.image_url || null, provenance: {...candidate.provenance,...(userBound?{identity:'user_confirmed_barcode',source_barcode:null,exact_barcode:false}:{}),label_image_url:candidate.nutrition_image_url || null},
  };
}
const encoder = new TextEncoder();
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function bytes(s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
async function key(secret) { return crypto.subtle.importKey('raw', encoder.encode('barcode-recovery-v1:' + secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign','verify']); }
// A client may display proposals but cannot change their evidence, owner, identity or catalog revision.
export async function sealDraft(draft, secret) {
  const payload = b64(encoder.encode(JSON.stringify(draft)));
  const signature = b64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))));
  return payload + '.' + signature;
}
export async function openDraft(token, secret, owner, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 60000) throw Error('invalid_proposal');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !await crypto.subtle.verify('HMAC', await key(secret), bytes(signature), encoder.encode(payload))) throw Error('invalid_proposal');
  const draft = JSON.parse(new TextDecoder().decode(bytes(payload)));
  if (draft.owner !== owner || draft.expires < now || draft.version !== 1) throw Error('expired_proposal');
  return draft;
}
