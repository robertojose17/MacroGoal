// Keep deployed and historical entitlement identifiers compatible.
// Cancellation (willRenew=false) is not revocation while isActive remains true.
export const PREMIUM_ENTITLEMENT_IDS = ['pro', 'Macrogoal Pro', 'macrogoal_pro', 'premium'] as const;
export function premiumEntitlement(info: any, configuredId?: string): any | null {
  const ids = configuredId ? [configuredId, ...PREMIUM_ENTITLEMENT_IDS] : PREMIUM_ENTITLEMENT_IDS;
  return ids.map(id => info?.entitlements?.active?.[id]).find(value => value?.isActive === true) ?? null;
}

/** Unknown negative data cannot revoke a known same-account positive result. */
export function premiumFallbackState(knownSameAccountPremium: boolean, profilePremium = false) {
  const isPremium = knownSameAccountPremium || profilePremium;
  return { isPremium, error: isPremium ? null : 'PREMIUM_STATUS_UNAVAILABLE' };
}
