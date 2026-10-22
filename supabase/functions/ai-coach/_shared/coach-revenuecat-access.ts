import { coachEntitlementIds, type Access } from './coach-access.ts';

const record = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const date = (x: unknown) => typeof x === 'string' ? Date.parse(x) : NaN;

// Only a server-fetched GET /v1/subscribers response is accepted here.
// Customer Info contains expired entitlements too: presence alone grants nothing.
export type RevenueCatAccessCheck={access:Access;reason?:'missing_key'|'http_status'|'timeout'|'invalid_entitlement'|'transport_error'};
export function evaluateRevenueCatAccessDetailed(body: unknown, now = Date.now()): RevenueCatAccessCheck {
  if (!record(body) || !record(body.subscriber) || !record(body.subscriber.entitlements)) return {access:'unknown',reason:'invalid_entitlement'};
  const subscriber = body.subscriber;
  let uncertain = false;
  for (const id of coachEntitlementIds) {
    if (!Object.hasOwn(subscriber.entitlements, id)) continue;
    const entitlement = subscriber.entitlements[id];
    if (!record(entitlement) || !Number.isFinite(date(entitlement.purchase_date)) || date(entitlement.purchase_date) > now) { uncertain = true; continue; }
    if (entitlement.expires_date === null) return {access:'premium'};
    const expiration = date(entitlement.expires_date);
    if (!Number.isFinite(expiration)) { uncertain = true; continue; }
    if (expiration > now) return {access:'premium'};
    if (typeof entitlement.product_identifier !== 'string' || !record(subscriber.subscriptions)) { uncertain = true; continue; }
    const subscription = subscriber.subscriptions[entitlement.product_identifier];
    if (!record(subscription)) { uncertain = true; continue; }
    // No guessed grace window, and no grace borrowed from an unrelated product.
    const grace = subscription.grace_period_expires_date;
    if (grace === null) continue;
    if (!Number.isFinite(date(grace))) { uncertain = true; continue; }
    if (date(grace) > now) return {access:'premium'};
  }
  return uncertain ? {access:'unknown',reason:'invalid_entitlement'} : {access:'free'};
}

export function evaluateRevenueCatAccess(body: unknown, now = Date.now()): Access {return evaluateRevenueCatAccessDetailed(body,now).access;}

export async function fetchRevenueCatAccessDetailed(userId: string, apiKey: string | undefined, now = Date.now(), request: typeof fetch = fetch): Promise<RevenueCatAccessCheck> {
  if (!apiKey) return {access:'unknown',reason:'missing_key'};
  try {
    const response = await request(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return {access:'unknown',reason:'http_status'};
    let body:unknown;try{body=await response.json();}catch{return {access:'unknown',reason:'invalid_entitlement'};}
    return evaluateRevenueCatAccessDetailed(body,now);
  } catch (error) { const name=error&&typeof error==='object'?'name' in error?String((error as {name?:unknown}).name):'':'';return {access:'unknown',reason:name==='TimeoutError'||name==='AbortError'?'timeout':'transport_error'}; } // Never log keys, subscriber data, or provider errors.
}

export async function fetchRevenueCatAccess(userId: string, apiKey: string | undefined, now = Date.now(), request: typeof fetch = fetch): Promise<Access> {return (await fetchRevenueCatAccessDetailed(userId,apiKey,now,request)).access;}

