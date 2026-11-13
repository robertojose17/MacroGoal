// Memory only. Never retain image bytes or tokens; never reuse an attempt across accounts.
export type UnknownAttempt = {
  webRequestId: string; webAttempted: boolean;
  requestId: string; selected?: any; frontUrl?: string; review?: any; rearAttempted: boolean;
  pending?: Promise<any>; expires: number;
};
const attempts = new Map<string, UnknownAttempt>();
// This is an idempotency nonce, not a credential or authorization token.
function nonce() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
export function unknownBarcodeAttempt(owner: string, barcode: string, now = Date.now()) {
  const key = owner + ':' + barcode;
  for (const [id, attempt] of attempts) if (now >= attempt.expires) attempts.delete(id);
  let attempt = attempts.get(key);
  if (!attempt) {
    attempt = { webRequestId: nonce(), webAttempted:false, requestId: nonce(), rearAttempted: false, expires: now + 20 * 60 * 1000 };
    attempts.set(key, attempt);
  }
  return attempt;
}
export function runUnknownAttempt(attempt: UnknownAttempt, work: () => Promise<any>) {
  if (attempt.pending) return attempt.pending;
  const pending = Promise.resolve().then(work).then(review => {
    attempt.review = review;
    if (Number.isFinite(review?.expires_at)) attempt.expires = review.expires_at;
    return review;
  }).finally(() => { if (attempt.pending === pending) attempt.pending = undefined; });
  attempt.pending = pending;
  return pending;
}

/** The initial barcode-only discovery gets one nonce and one attempt, separate from the front photo. */
export function runUnknownWebAttempt(attempt: UnknownAttempt, work: () => Promise<any>) {
  if (attempt.pending) return attempt.pending;
  if (attempt.webAttempted) return Promise.resolve(attempt.review);
  attempt.webAttempted = true;
  return runUnknownAttempt(attempt, work);
}
