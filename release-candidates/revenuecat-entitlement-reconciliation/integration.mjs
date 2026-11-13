import {planExpiration} from './policy.mjs';
// Called only AFTER webhook auth, BEFORE any existing event/mirror/profile writes.
// Caller MUST return this result and NOT fall through to legacy upsert.
// Provider reader must call official RC with SERVER credential, bounded timeout,
// exact app_user_id. User-facing clients cannot call the service-only RPC.
export async function reconcileExpiration(event,{readState,loadProvider,rpc,now=Date.now}){
  const no=reason=>({applied:false,reason});
  if(event?.store==='PROMOTIONAL'||event?.period_type==='PROMOTIONAL')return no('promotional_requires_separate_registry');
  if(event?.type!=='EXPIRATION')return no('outside_scope');
  try {
    const state=await readState(event.app_user_id);
    if(!state?.profile||!state?.subscription)return no('missing_state');
    // Read state before provider fetch; concurrent writes invalidate CAS.
    const provider=await loadProvider(event.app_user_id);
    const verifiedAt=now();
    const plan=planExpiration({event,mirror:state.subscription,providerBody:provider.body,providerStatus:provider.status,now:verifiedAt});
    if(!plan.proceed)return no(plan.reason);
    const result=await rpc('reconcile_expiration_cas_v1',{
      p_actor:event.app_user_id,p_subscription_id:state.subscription.id,
      p_expected_profile_updated_at:state.profile.updated_at,
      p_expected_profile_type:state.profile.user_type,
      p_expected_subscription_updated_at:state.subscription.updated_at,
      p_product_id:event.product_id,p_store:event.store,p_environment:event.environment,
      p_event_expiration_at:new Date(event.expiration_at_ms).toISOString(),
      p_provider_state:'inactive',p_provider_verified_at:new Date(verifiedAt).toISOString()
    });
    if(result.error)return no('transaction_failed');
    return result.data;
  }catch{return no('provider_or_state_unavailable');}
}
