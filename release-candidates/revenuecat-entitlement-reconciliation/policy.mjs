// Candidate only. No credentials, database writes, or deployment.
const aliases=['pro','Macrogoal Pro','macrogoal_pro','premium'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const time=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function classifyProvider(body,status,now) {
  if(status!==200||!object(body?.subscriber?.entitlements)||!Number.isFinite(now))return 'unknown';
  const {entitlements,subscriptions}=body.subscriber;
  let unknown=false;
  for(const alias of aliases){
    if(!Object.hasOwn(entitlements,alias))continue;
    const e=entitlements[alias];
    if(!object(e)){unknown=true;continue;}
    const sub=object(subscriptions)&&typeof e.product_identifier==='string'?subscriptions[e.product_identifier]:undefined;
    let malformed=sub!==undefined&&!object(sub);
    for(const grace of [e.grace_period_expires_date,object(sub)?sub.grace_period_expires_date:undefined]){
      if(grace==null)continue;
      const end=time(grace);
      if(end===null)malformed=true;
      else if(end>now)return 'active';
    }
    if(e.expires_date===null)return 'active';
    const end=time(e.expires_date);
    if(end!==null&&end>now)return 'active';
    if(end===null||malformed)unknown=true;
  }
  return unknown?'unknown':'inactive';
}
export function planExpiration({event,mirror,providerBody,providerStatus,now}){
  const stop=reason=>({proceed:false,reason,subscriptionPatch:null,profilePatch:null});
  // No implicit QA access: promotional grants need separately stored authority.
  if(event?.store==='PROMOTIONAL'||event?.period_type==='PROMOTIONAL')
    return stop('promotional_requires_separate_registry');
  if(event?.type!=='EXPIRATION')return stop('outside_scope');
  const provider=classifyProvider(providerBody,providerStatus,now);
  if(provider==='unknown')return stop('provider_unavailable');
  if(!object(mirror)||!event.product_id||!event.store||!event.environment||
    mirror.product_id!==event.product_id||mirror.store!==event.store||
    mirror.environment!==event.environment)return stop('unrelated_mirror');
  if(provider==='active')return stop('other_or_renewed_entitlement_active');
  const eventExpiry=event.expiration_at_ms;
  const mirrorExpiry=time(mirror.expiration_at);
  if(typeof eventExpiry!=='number'||!Number.isFinite(eventExpiry)||eventExpiry>now||
    mirrorExpiry===null||mirrorExpiry>eventExpiry)return stop('stale_or_invalid_expiration');
  return {proceed:true,reason:'provider_confirmed_inactive',
    subscriptionPatch:{status:'inactive',will_renew:false},profilePatch:{user_type:'free'}};
}
export async function verifyExpiration(input,{loadProvider,readMirror}){
  // Caller authenticates webhook first; injected loaders are SERVER ONLY.
  // Failure returns no write plan. No outbound API call or secret in this module.
  try{
    const [provider,mirror]=await Promise.all([loadProvider(input.event.app_user_id),readMirror(input.event.app_user_id)]);
    return planExpiration({...input,mirror,providerBody:provider.body,providerStatus:provider.status});
  }catch{return {proceed:false,reason:'provider_or_mirror_unavailable',subscriptionPatch:null,profilePatch:null};}
}
