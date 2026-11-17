/** Nonsecret versioned application configuration, not eligibility or approval.
 * The database must independently match its registered enabled policy exactly.
 * Source/provider validity and release gates are not configured here. */
export const PRODUCTION_RULES14_BINDING=Object.freeze({
 version:'rules14-general-adult-v1',revision:1,
 digest:'65c9dd0d1ed3c0f5ef9fede9e76c5683ea05ca440e21dcfbe35fa40b8fdc063e',
 engineVersion:'rules14-v1',
} as const);
export const POLICY_ENV_KEYS=Object.freeze(['TDEE_REVIEW_POLICY_VERSION','TDEE_REVIEW_POLICY_REVISION','TDEE_REVIEW_POLICY_DIGEST','TDEE_REVIEW_ENGINE_VERSION'] as const);
export function readAdaptiveReviewPolicyBinding(get:(key:string)=>string|undefined){
 const values=POLICY_ENV_KEYS.map(key=>get(key));
 // Only complete absence selects versioned source configuration. Empty values
 // count as present and fail closed; never mix an override with defaults.
 if(values.every(value=>value===undefined))return {...PRODUCTION_RULES14_BINDING};
 if(values.some(value=>value===undefined))return null;
 const [version,raw,digest,engineVersion]=values;
 if(!version||version.trim()!==version||version.length>200||!digest||!/^[a-f0-9]{64}$/.test(digest)||engineVersion!=='rules14-v1'||!raw||!/^[1-9][0-9]*$/.test(raw))return null;
 const revision=Number(raw);if(!Number.isSafeInteger(revision))return null;
 return {version,digest,engineVersion,revision};
}
