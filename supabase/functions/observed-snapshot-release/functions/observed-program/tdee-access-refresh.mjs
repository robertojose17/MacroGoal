// Authenticated TDEE flows refresh all owners, never only those with a tester marker.
export function createTdeeAccessRefresh({readContext,refreshAuthority,now=Date.now}) {
 return async authorization => {
  const started=now();
  if(!Number.isSafeInteger(started))throw Error('observation_unavailable');
  const deadline=started+30000;
  const before=await readContext(authorization);
  if(!before || typeof before.ownerId!=='string' || !before.ownerId) throw Error('observation_unavailable');
  for(let attempt=0;attempt<2;attempt++){
   const remaining=deadline-now();
   if(!Number.isSafeInteger(remaining)||remaining<=0)throw Error('observation_unavailable');
   const result=await refreshAuthority(authorization,{timeoutMs:remaining});
   if(!result || result.ownerId!==before.ownerId || result.version!=='premium-authority-v1' || !['premium','free','unknown'].includes(result.access)) throw Error('observation_unavailable');
   if(result.access==='unknown') throw Error('observation_unavailable');
   const at=now();
   if(at>=deadline||!Number.isSafeInteger(result.checkedAt)||!Number.isSafeInteger(result.validUntil)||result.checkedAt>at||result.validUntil<=at||result.validUntil>result.checkedAt+30000) throw Error('observation_unavailable');
   // Reread SQL authority after provider/CAS. A response flag cannot grant access.
   const after=await readContext(authorization),readAt=now();
   if(readAt>=deadline||!after || after.ownerId!==before.ownerId || after.premium!==(result.access==='premium')) throw Error('observation_unavailable');
   if(after.premium){
    if(!Number.isSafeInteger(after.accessValidUntil)||after.accessValidUntil<=readAt||after.accessValidUntil>readAt+30000)throw Error('observation_unavailable');
    if(after.accessValidUntil>result.validUntil){
     // Another genuine refresh may have advanced SQL after our response. Never
     // trust the larger marker alone: one new authority response must cover it.
     if(attempt===0)continue;
     throw Error('observation_unavailable');
    }
   }
   return;
  }
 };
}
