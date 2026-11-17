import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { ADAPTIVE_RELEASE_STATE } from '../../../../../release-candidates/tdee-adaptive-review/proposal.ts';
import { createSnapshotHttpHandler } from '../../../../../release-candidates/tdee-adaptive-review/snapshotHttpHandler.ts';
import { createSnapshotOrchestrationSupabaseRuntime } from '../../../../../release-candidates/tdee-adaptive-review/snapshotOrchestrationSupabaseAdapter.ts';
import {readAdaptiveReviewPolicyBinding} from '../../../../../release-candidates/tdee-adaptive-review/adaptivePolicyBinding.ts';
export {readAdaptiveReviewPolicyBinding} from '../../../../../release-candidates/tdee-adaptive-review/adaptivePolicyBinding.ts';
const unavailable=(reason:string)=>({reason,proposal:null,mayHaveWritten:false});
let runtime: ReturnType<typeof createSnapshotOrchestrationSupabaseRuntime>|undefined;
/** POST only. No request may supply policy, actor, evidence, targets or enable flags. */
export const handleAdaptiveReview=createSnapshotHttpHandler(async request=>{
 if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return unavailable('safety_review_required');
 const binding=readAdaptiveReviewPolicyBinding(key=>Deno.env.get(key));
 if(!binding)return unavailable('server_policy_required');
 runtime??=createSnapshotOrchestrationSupabaseRuntime({
  url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',createClient,
 },binding);
 return runtime(request);
},['https://macro-goal.expo.app']);

/** Separate explicit acceptance route. Never exposes or constructs a service-key client. */
import {LEGACY_SNAPSHOT_HTTP_ACCEPT_RELEASE,createSnapshotAcceptHttpHandler,createSnapshotAcceptSupabaseRuntime} from '../../../../../release-candidates/tdee-adaptive-review/snapshotAcceptEndpoint.ts';
let acceptRuntime:ReturnType<typeof createSnapshotAcceptSupabaseRuntime>|undefined;
export const handleAdaptiveAccept=createSnapshotAcceptHttpHandler(async request=>{
 if(!LEGACY_SNAPSHOT_HTTP_ACCEPT_RELEASE.enabled||!ADAPTIVE_RELEASE_STATE.recommendationsEnabled||!ADAPTIVE_RELEASE_STATE.acceptanceEnabled)return {reason:'safety_review_required',receipt:null,mayHaveWritten:false};
 try{
  acceptRuntime??=createSnapshotAcceptSupabaseRuntime({
   url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',createClient
  });
 }catch{return {reason:'source_error',receipt:null,mayHaveWritten:false};}
 return acceptRuntime(request);
},['https://macro-goal.expo.app']);


