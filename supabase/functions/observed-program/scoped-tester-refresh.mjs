// A targeted context marker is server-generated; clients cannot nominate a tester.
export function createTesterRefresh({readContext,refreshAuthority,now=Date.now}) {
 return async authorization => {
  const context=await readContext(authorization);
  if(!Object.hasOwn(context,'accessValidUntil')) return;
  const result=await refreshAuthority(authorization);
  if(!result || result.ownerId!==context.ownerId) throw Error('observation_unavailable');
  // Unknown/denied is not a grant. Fresh SQL context independently enforces evidence.
  if(result.access==='premium' && (!Number.isFinite(result.validUntil)||result.validUntil<=now())) throw Error('observation_unavailable');
 };
}
