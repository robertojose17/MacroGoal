/** Inactive source only. Changing a flag alone must never authorize backend access. */
export const COMMUNITY_PRIVACY_V2_ENABLED = true as const;
/** Deliberate local development opt-in; this inactive candidate never enables it. */
export const COMMUNITY_PRIVACY_PAIR_PILOT_OPT_IN = false as const;

export function isCommunityPrivacyRolloutRequested(globalEnabled: boolean, pilotOptIn: boolean, development: boolean): boolean {
  return globalEnabled || (development && pilotOptIn);
}
