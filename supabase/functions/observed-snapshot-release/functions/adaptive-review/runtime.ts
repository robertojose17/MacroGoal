import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { ADAPTIVE_RELEASE_STATE } from '../../../../../release-candidates/tdee-adaptive-review/proposal.ts';
import { createSnapshotHttpHandler } from '../../../../../release-candidates/tdee-adaptive-review/snapshotHttpHandler.ts';
import { createSnapshotOrchestrationSupabaseRuntime } from '../../../../../release-candidates/tdee-adaptive-review/snapshotOrchestrationSupabaseAdapter.ts';
const unavailable=(reason:string)=>({reason,proposal:null,mayHaveWritten:false});
let runtime: ReturnType<typeof createSnapshotOrchestrationSupabaseRuntime>|undefined;
/** POST only. No request may supply policy, actor, evidence, targets or enable flags. */
export const handleAdaptiveReview=createSnapshotHttpHandler(async request=>{
 if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return unavailable('safety_review_required');
 const version=Deno.env.get('TDEE_REVIEW_POLICY_VERSION');
 const digest=Deno.env.get('TDEE_REVIEW_POLICY_DIGEST');
 const engineVersion=Deno.env.get('TDEE_REVIEW_ENGINE_VERSION');
 if(!version||!digest||!engineVersion)return unavailable('server_policy_required');
 runtime??=createSnapshotOrchestrationSupabaseRuntime({
  url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
  serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',createClient,
 },{version,digest,engineVersion});
 return runtime(request);
},['https://macro-goal.expo.app']);
