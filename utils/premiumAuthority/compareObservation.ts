import type { Decision } from './authorityClient';
/** Diagnostic only. Never use a comparison as an access grant or revocation. */
export type PremiumComparison = 'pending' | 'unavailable' | 'agree_premium' | 'agree_free' |
 'authority_premium_legacy_free' | 'authority_free_legacy_premium';
export function comparePremiumObservation(
 ownerId: string | null, legacyPremium: boolean, loading: boolean,
 decision: Decision | null, now: number = Date.now()
): PremiumComparison {
 if (loading || !ownerId) return 'pending';
 if (!decision || decision.ownerId !== ownerId || decision.access === 'unknown') return 'unavailable';
 if (!Number.isSafeInteger(now) || !Number.isSafeInteger(decision.checkedAt) ||
     !Number.isSafeInteger(decision.validUntil) || decision.checkedAt! > now ||
     now - decision.checkedAt! >= 30000 || decision.validUntil! <= now ||
     decision.validUntil! > decision.checkedAt! + 30000) return 'unavailable';
 const expected = decision.policyContext === 'test_account'
   ? ['PRODUCTION', 'SANDBOX'] : ['PRODUCTION'];
 if (JSON.stringify(decision.evaluatedEnvironments) !== JSON.stringify(expected)) return 'unavailable';
 if (decision.access === 'premium') return legacyPremium ? 'agree_premium' : 'authority_premium_legacy_free';
 return legacyPremium ? 'authority_free_legacy_premium' : 'agree_free';
}
