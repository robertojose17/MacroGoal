import {readAdaptiveReviewPolicyBinding,handleAdaptiveReview} from '../supabase/functions/observed-snapshot-release/functions/adaptive-review/runtime.ts';
const assert=(v:unknown)=>{if(!v)throw Error('assertion_failed');};
const base={TDEE_REVIEW_POLICY_VERSION:'rules1',TDEE_REVIEW_POLICY_DIGEST:'a'.repeat(64),TDEE_REVIEW_ENGINE_VERSION:'rules14-v1'};
Deno.test('actual production entry reads exact positive rules policy revision',()=>{
 const env={...base,TDEE_REVIEW_POLICY_REVISION:'7'};const b=readAdaptiveReviewPolicyBinding(k=>(env as Record<string,string>)[k]);assert(b?.revision===7&&b.version==='rules1'&&b.digest===base.TDEE_REVIEW_POLICY_DIGEST&&b.engineVersion==='rules14-v1');
});
Deno.test('actual production entry rejects absent, malformed and unsafe revision without fallback',()=>{
 for(const revision of [undefined,'','0','-1','1.5','1e2',' 1','01','9007199254740992']){const env={...base,TDEE_REVIEW_POLICY_REVISION:revision};assert(readAdaptiveReviewPolicyBinding(k=>(env as Record<string,string|undefined>)[k])===null);}
});
Deno.test('legacy binding remains revision-free and malformed digest is rejected',()=>{
 const env={...base,TDEE_REVIEW_ENGINE_VERSION:'rate-review-14d-v1'};const b=readAdaptiveReviewPolicyBinding(k=>(env as Record<string,string>)[k]);assert(b?.engineVersion==='rate-review-14d-v1'&&b.revision===undefined);assert(readAdaptiveReviewPolicyBinding(k=>k==='TDEE_REVIEW_POLICY_DIGEST'?'bad':(env as Record<string,string>)[k])===null);
});
Deno.test('actual POST entry remains OFF and needs no environment or network access',async()=>{
 const response=await handleAdaptiveReview(new Request('https://example.test/?mode=adaptive-review-v1',{method:'POST',headers:{Authorization:'Bearer fixture'}}));const body=await response.json();assert(response.status===503&&body.reason==='safety_review_required');
});
