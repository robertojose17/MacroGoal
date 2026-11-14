// Server-only v2 evidence validator and in-memory integration model.
// No public request may construct evidence or choose a privileged environment.
export function evaluateV2Evidence(e,actor,environment,now=Date.now()) {
 const unknown=reason=>({state:'unknown',reason,writeCanonical:false});
 if(typeof actor!=='string'||!actor||!['PRODUCTION','SANDBOX'].includes(environment))return unknown('invalid_scope');
 if(e?.source!=='revenuecat_v2_server'||e.owner!==actor||e.environment!==environment)return unknown('untrusted_or_wrong_scope');
 if(e.state==='unknown')return unknown('official_unknown');
 if(!Number.isFinite(e.checkedAt)||!Number.isFinite(e.completedAt)||e.checkedAt>e.completedAt||e.completedAt>now||now-e.checkedAt>30000||e.completedAt-e.checkedAt>25000)return unknown('stale_or_invalid_evidence');
 if(e.coverage?.subscriptions!==true||e.coverage?.purchases!==true||e.coverage?.entitlementRelations!==true||e.coverage?.atomicSnapshot!==false)return unknown('invalid_coverage');
 if(typeof e.providerGivesAccess!=='boolean'||e.state!==(e.providerGivesAccess?'active':'inactive')||typeof e.scopeComplete!=='boolean')return unknown('conflicting_state');
 if(!e.providerGivesAccess&&!e.scopeComplete)return unknown('incomplete_no_downgrade');
 return {state:e.state,writeCanonical:true,reason:'verified_v2_observation'};
}
export function createV2Cache({readOfficial,now=Date.now}) {
 const records=new Map();
 const key=(a,e)=>JSON.stringify([a,e]);
 const valid=(a,e)=>typeof a==='string'&&a.length>0&&['PRODUCTION','SANDBOX'].includes(e);
 const get=(a,e)=>records.get(key(a,e))??{version:0,dirty:true,evidence:null};
 function invalidate(actor,environment){if(!valid(actor,environment))throw Error('invalid_scope');const r=get(actor,environment);records.set(key(actor,environment),{...r,dirty:true,version:r.version+1});}
 async function refresh(actor,environment){
  if(!valid(actor,environment))return {committed:false,reason:'invalid_scope'};
  const expected=get(actor,environment).version;let evidence;
  try{evidence=await readOfficial({actor,environment});}catch{return {committed:false,reason:'official_unavailable'};}
  const d=evaluateV2Evidence(evidence,actor,environment,now());if(!d.writeCanonical)return {committed:false,reason:d.reason};
  const r=get(actor,environment);
  if(r.version!==expected)return {committed:false,reason:'cas_conflict'};
  if(r.evidence&&evidence.checkedAt<=r.evidence.checkedAt)return {committed:false,reason:'nonmonotonic_snapshot'};
  // Minimal persisted projection: no transaction/subscription IDs, health values, or money.
  const {source,owner,environment:env,checkedAt,completedAt,state,scopeComplete,coverage,providerGivesAccess}=evidence;
  records.set(key(actor,environment),{version:expected+1,dirty:false,evidence:{source,owner,environment:env,checkedAt,completedAt,state,scopeComplete,coverage,providerGivesAccess}});
  return {committed:true,state:d.state,version:expected+1};
 }
 function authority(actor,environment){const r=get(actor,environment);if(r.dirty)return {state:'unknown',allowed:false,reason:'refresh_required'};const d=evaluateV2Evidence(r.evidence,actor,environment,now());return {state:d.state,allowed:d.state==='active',reason:d.reason};}
 return {refresh,invalidate,authority};
}
