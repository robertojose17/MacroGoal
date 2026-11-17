/** Server configuration only. A rules policy revision is not a credential and
 * must identify the same registered immutable document as version/digest. */
export function readAdaptiveReviewPolicyBinding(get:(key:string)=>string|undefined){
 const version=get('TDEE_REVIEW_POLICY_VERSION'),digest=get('TDEE_REVIEW_POLICY_DIGEST'),engineVersion=get('TDEE_REVIEW_ENGINE_VERSION');
 if(!version||!version.trim()||version.length>200||!digest||!/^[a-f0-9]{64}$/.test(digest)||!engineVersion)return null;
 if(engineVersion==='rules14-v1'){
  const raw=get('TDEE_REVIEW_POLICY_REVISION');
  if(!raw||!/^[1-9][0-9]*$/.test(raw))return null;
  const revision=Number(raw);if(!Number.isSafeInteger(revision))return null;
  return {version,digest,engineVersion,revision};
 }
 return {version,digest,engineVersion};
}
