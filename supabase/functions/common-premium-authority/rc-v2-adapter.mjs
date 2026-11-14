// Private server-only read adapter. Inject authenticated GET transport; never a client payload.
// No credentials, account writes, alias inference, or production integration here.
const ORIGIN='https://api.revenuecat.com';
const aliases=new Set(['pro','Macrogoal Pro','macrogoal_pro','premium','Premium']);
const id=x=>typeof x==='string'&&x.length>0&&x.length<=1500;
export function createRCV2Reader({projectId,getJSON,now=Date.now,maxPages=100,maxRequests=250}) {
 if(!id(projectId)||typeof getJSON!=='function')throw Error('configuration');
 const project=`/v2/projects/${encodeURIComponent(projectId)}`;
 return async function read({actor,environment}) {
  const started=now();let requests=0;
  const unknown=reason=>({source:'revenuecat_v2_server',owner:actor,environment,state:'unknown',scopeComplete:false,writeCanonical:false,reason});
  if(!id(actor)||!['PRODUCTION','SANDBOX'].includes(environment))return unknown('invalid_scope');
  const env=environment.toLowerCase();
  async function list(path,filters={}) {
   let url=new URL(path,ORIGIN);for(const [k,v] of Object.entries({...filters,limit:'100'}))url.searchParams.set(k,v);
   let items=[],seen=new Set(),ids=new Set();
   for(let page=0;page<maxPages;page++) {
    if(url.origin!==ORIGIN||url.pathname!==path||url.username||url.password||url.hash)throw Error('pagination_scope');
    for(const [k,v] of Object.entries(filters)) {
     const values=url.searchParams.getAll(k);if(values.length>1||(values.length===1&&values[0]!==v))throw Error('pagination_filter');
     url.searchParams.set(k,v); // API examples omit environment in next_page; preserve exact filter.
    }
    for(const k of url.searchParams.keys())if(!['limit','starting_after',...Object.keys(filters)].includes(k))throw Error('pagination_query');
    if(seen.has(url.href))throw Error('pagination_cycle');seen.add(url.href);
    if(++requests>maxRequests||now()-started>25000)throw Error('read_budget');
    const response=await getJSON(url.href,{method:'GET',redirect:'error'});
    if(response?.status!==200)throw Error(`official_http_${response?.status??'invalid'}`);
    const body=response.body;
    if(body?.object!=='list'||!Array.isArray(body.items)||!Object.hasOwn(body,'next_page'))throw Error('invalid_list');
    for(const item of body.items){if(!id(item.id)||ids.has(item.id))throw Error('duplicate_or_invalid_id');ids.add(item.id);items.push(item);}
    if(body.next_page===null)return items;
    if(typeof body.next_page!=='string'||!body.next_page)throw Error('invalid_next_page');
    url=new URL(body.next_page,ORIGIN);
   }
   throw Error('pagination_incomplete');
  }
  try {
   const customer=`${project}/customers/${encodeURIComponent(actor)}`;
   const subscriptions=await list(`${customer}/subscriptions`,{environment:env});
   const purchases=await list(`${customer}/purchases`,{environment:env});
   const claims=[];let unsupportedPurchase=false;
   for(const [kind,rows] of [['subscriptions',subscriptions],['purchases',purchases]]) {
    for(const row of rows) {
     if(row.customer_id!==actor||row.environment!==env)throw Error('identity_or_environment_mismatch');
     if(row.object!==(kind==='subscriptions'?'subscription':'purchase'))throw Error('invalid_resource');
     // Query full relation rather than trusting an embedded, possibly truncated list.
     const ents=await list(`${project}/${kind}/${encodeURIComponent(row.id)}/entitlements`);
     for(const ent of ents)if(ent.project_id!==projectId||ent.object!=='entitlement'||typeof ent.lookup_key!=='string')throw Error('entitlement_scope');
     if(!ents.some(e=>aliases.has(e.lookup_key)))continue;
     if(kind==='purchases') {unsupportedPurchase=true;continue;} // Non-recurring lifetime/refund semantics require explicit adapter contract.
     if(typeof row.gives_access!=='boolean')throw Error('missing_gives_access');
     claims.push({id:row.id,givesAccess:row.gives_access,endsAt:row.ends_at,status:row.status});
    }
   }
   if(now()-started>25000)throw Error('read_budget');
   const active=claims.some(c=>c.givesAccess);
   if(!active&&unsupportedPurchase)return unknown('non_subscription_entitlement_needs_verified_adapter');
   const knownActiveEnds=claims.filter(c=>c.givesAccess&&Number.isFinite(c.endsAt)&&c.endsAt>now()).map(c=>c.endsAt);
   // Do not assign a cache lifetime to missing/indefinite/grace expiry.
   if(active&&!knownActiveEnds.length)return unknown('active_validity_unbounded');
   const providerValidUntil=active?Math.max(...knownActiveEnds):null;
   return {source:'revenuecat_v2_server',owner:actor,environment,checkedAt:started,completedAt:now(),
    state:active?'active':'inactive',scopeComplete:!unsupportedPurchase,
    coverage:{subscriptions:true,purchases:true,entitlementRelations:true,atomicSnapshot:false},
    providerGivesAccess:active,providerValidUntil,validUntil:Math.min(started+30000,providerValidUntil??Infinity),
    // Deliberately NOT resolver proof: avoid fabricating lifetime/expiry from gives_access.
    writeCanonical:false,reason:'v2_evidence_requires_scoped_commit_adapter'};
  }catch(error){return unknown(error.message);}
 };
}
