/** Nonsecret versioned application configuration, not eligibility or approval.
 * The database must independently match its registered enabled policy exactly.
 * Source/provider validity and release gates are not configured here. */
export const PRODUCTION_RULES14_BINDING=Object.freeze({
 version:'rules14-observed-profile-v2',revision:1,
 digest:'d67f7ee3483621046a726597da146bb5c6bde328a36be9ef672c04574689bcfd',
 engineVersion:'rules14-observed-v2',
} as const);
export const POLICY_ENV_KEYS=Object.freeze(['TDEE_REVIEW_POLICY_VERSION','TDEE_REVIEW_POLICY_REVISION','TDEE_REVIEW_POLICY_DIGEST','TDEE_REVIEW_ENGINE_VERSION'] as const);
export function readAdaptiveReviewPolicyBinding(get:(key:string)=>string|undefined){
 const values=POLICY_ENV_KEYS.map(key=>get(key));
 // Only complete absence selects versioned source configuration. Empty values
 // count as present and fail closed; never mix an override with defaults.
 if(values.every(value=>value===undefined))return {...PRODUCTION_RULES14_BINDING};
 if(values.some(value=>value===undefined))return null;
 const [version,raw,digest,engineVersion]=values;
 if(!version||version.trim()!==version||version.length>200||!digest||!/^[a-f0-9]{64}$/.test(digest)||engineVersion!=='rules14-observed-v2'||!raw||!/^[1-9][0-9]*$/.test(raw))return null;
 const revision=Number(raw);if(!Number.isSafeInteger(revision))return null;
 return {version,digest,engineVersion,revision};
}

