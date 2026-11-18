/** Read-only attention summary. Never a proposal, consent, or authority to change targets. */
export type TdeeDashboardAttention={version:'dashboard-attention-v1';ownerId:string;capturedAt:string;expiresAt:number;premium:boolean;status:'attention'|'none'|'unavailable';reason:'review_needed'|'no_change'|'insufficient_data'|'baseline_required'|'baseline_reconfirmation_required'|'unavailable';actionable:false;proposal:null};
const keys='actionable,capturedAt,expiresAt,ownerId,premium,proposal,reason,status,version';
export function parseTdeeDashboardAttention(value:unknown,owner:string,now=Date.now()):TdeeDashboardAttention{
 const fail=():never=>{throw Error('dashboard_attention_unverified');};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const v=value as Record<string,unknown>,time=typeof v.capturedAt==='string'?Date.parse(v.capturedAt):NaN;
 if(Object.keys(v).sort().join(',')!==keys||v.version!=='dashboard-attention-v1'||v.ownerId!==owner||!owner||typeof v.premium!=='boolean'||v.actionable!==false||v.proposal!==null||!Number.isFinite(time)||time>now||typeof v.expiresAt!=='number'||!Number.isFinite(v.expiresAt)||v.expiresAt<=now||v.expiresAt>time+30000)return fail();
 if(v.status==='attention'?!((v.reason==='review_needed')||(['baseline_required','baseline_reconfirmation_required'].includes(String(v.reason))&&v.premium===true)):v.status==='none'?!['no_change','insufficient_data','baseline_required'].includes(String(v.reason)):v.status==='unavailable'?v.reason!=='unavailable':true)return fail();
 return {...v} as TdeeDashboardAttention;
}
export function dashboardAttentionView(value:TdeeDashboardAttention|null,now=Date.now()){
 if(!value||now<Date.parse(value.capturedAt)||now>=value.expiresAt)return {attention:false,premium:false,baseline:false};
 return {attention:value.status==='attention'&&value.reason==='review_needed',premium:value.status!=='unavailable'&&value.premium,baseline:false};
}

