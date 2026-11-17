// Authenticated TDEE flows refresh all owners, never only those with a tester marker.
export function createTdeeAccessRefresh({readContext,refreshAuthority,now=Date.now}) {
 return async authorization => {
  const before=await readContext(authorization);
  if(!before || typeof before.ownerId!=='string' || !before.ownerId) throw Error('observation_unavailable');
  const result=await refreshAuthority(authorization);
  if(!result || result.ownerId!==before.ownerId || result.version!=='premium-authority-v1' || !['premium','free','unknown'].includes(result.access)) throw Error('observation_unavailable');
  if(result.access==='unknown') throw Error('observation_unavailable');
  const at=now();
  if(!Number.isSafeInteger(result.checkedAt)||!Number.isSafeInteger(result.validUntil)||result.checkedAt>at||result.validUntil<=at||result.validUntil>result.checkedAt+30000) throw Error('observation_unavailable');
  // Reread SQL authority after provider/CAS. A response flag cannot grant access.
  const after=await readContext(authorization);
  if(!after || after.ownerId!==before.ownerId || after.premium!==(result.access==='premium')) throw Error('observation_unavailable');
  if(after.premium && (!Number.isSafeInteger(after.accessValidUntil)||after.accessValidUntil<=now()||after.accessValidUntil>result.validUntil)) throw Error('observation_unavailable');
 };
}
