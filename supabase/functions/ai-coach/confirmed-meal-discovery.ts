import {coachRequest} from './_shared/coach-access.ts';
import {validateDiscoverFoodArgs,validateStructuredCoachReply,type DiscoverFoodArgs} from './coach-model-led-contract.ts';
import {confirmedDiscoveryArgs} from './meal-discovery-consent.ts';
import {lookupIntent} from './coach-lookup-intent.ts';
type Proof={owner:string;source:string;requestId:string;retryOf:string|null;fingerprint:string;args:string};
const proofs=new WeakMap<Request,Proof>();
/** Admission metadata is derived from the same server-only proof, never a serialized caller flag. */
export function confirmedMealAdmissionPayload(request:Request,owner:string,body:any,payload:Record<string,unknown>){
 const args=confirmedDiscoveryArgs(lookupIntent(body.messages?.at(-1)?.content??''));
 return confirmedMealDiscoveryPlan(request,owner,body,args??undefined,true)?{...payload,use_web:true}:payload;
}
/** Server-only bridge factory, called AFTER owned same-day source and explicit consent checks. */
export function confirmedMealDiscoveryRequest(url:string,headers:Headers,body:any,owner:string):Request{
 const parsed=coachRequest(body);
 const args=body.messages?.length===1&&body.messages[0]?.role==='user'?confirmedDiscoveryArgs(lookupIntent(body.messages[0].content)):null;
 if(parsed.kind!=='message'||!body.meal_source_request_id||body.use_web!==true||!args)throw Error('invalid_confirmed_discovery');
 const request=new Request(url,{method:'POST',headers,body:JSON.stringify(body)});
 proofs.set(request,Object.freeze({owner,source:body.meal_source_request_id,requestId:parsed.requestId,retryOf:parsed.retryOfRequestId,fingerprint:parsed.fingerprintInput,args:JSON.stringify(args)}));
 return request;
}
/** Identity cannot survive serialization, a clone, a forged body marker, or a different owner/envelope. */
export function confirmedMealDiscoveryPlan(request:Request,owner:string,body:any,args:DiscoverFoodArgs|undefined,authorized:boolean){
 const proof=proofs.get(request),validated=args&&validateDiscoverFoodArgs(args);if(!proof||proof.owner!==owner||!authorized||!validated||JSON.stringify(validated)!==proof.args||body.use_web!==true||body.meal_source_request_id!==proof.source)return null;
 let parsed:ReturnType<typeof coachRequest>;try{parsed=coachRequest(body);}catch{return null;}
 if(parsed.kind!=='message'||parsed.requestId!==proof.requestId||parsed.retryOfRequestId!==proof.retryOf||parsed.fingerprintInput!==proof.fingerprint)return null;
 const output=validateStructuredCoachReply({text:'Searching the confirmed public food request.',choices:[]});
 if(!output)throw Error('invalid_deterministic_plan');
 // Local work only: no provider receipt, usage, generation ID, or model-authored text.
 return {output,cost:0,generationId:null,disposition:'lookup' as const};
}
