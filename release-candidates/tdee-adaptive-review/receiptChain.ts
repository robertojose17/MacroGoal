/** Private pure verifier. Caller must load all rows/count from one owner-scoped DB snapshot. */
type Obj=Record<string,unknown>;
const rec=(x:unknown):x is Obj=>!!x&&typeof x==='object'&&!Array.isArray(x);
const integer=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x);
const text=(x:unknown):x is string=>typeof x==='string'&&x.length>0;
const time=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
const same=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;
 if(!rec(a)||!rec(b))return false;
 const keys=Object.keys(a).sort();
 return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
};
export type VerifiedReceiptChain={acceptedCount:number;acceptedDelta:number;lastAcceptedAt:number|null;receiptsVerified:true};
export function verifySnapshotReceiptChain(value:unknown):VerifiedReceiptChain {
 const fail=():never=>{throw new Error('receipt_chain_unverified');};
 if(!rec(value)||!text(value.actor)||!rec(value.anchor)||!rec(value.currentGoal)||
 !Array.isArray(value.rows)||!integer(value.totalCount)||value.totalCount<0||value.totalCount>1000||value.rows.length!==value.totalCount)return fail();
 const {anchor:a,currentGoal:g,actor,rows}=value;
 if(a.owner_id!==actor||a.revoked!==false||!text(a.id)||!text(a.policy_version)||
 !integer(a.baseline_intake_kcal)||a.baseline_intake_kcal<=0||!integer(a.accepted_delta_kcal)||
 g.user_id!==actor||g.is_active!==true||a.active_goal_id!==g.id||
 a.baseline_intake_kcal+a.accepted_delta_kcal!==g.daily_calories)return fail();
 if(rows.length===0){
 if(a.accepted_delta_kcal!==0||a.last_accepted_at!==null)return fail();
 return {acceptedCount:0,acceptedDelta:0,lastAcceptedAt:null,receiptsVerified:true};
 }
 const ordered=[...rows].sort((x,y)=>time(rec(x)&&rec(x.receipt)&&rec(x.receipt.accepted_goal)?x.receipt.accepted_goal.created_at:null)-time(rec(y)&&rec(y.receipt)&&rec(y.receipt.accepted_goal)?y.receipt.accepted_goal.created_at:null));
 let prior:Obj|null=null,net=0,last=-Infinity;
 const requests=new Set<string>(),proposals=new Set<string>(),goals=new Set<string>();
 for(const row of ordered){
 if(!rec(row)||!rec(row.receipt)||!rec(row.proposal))return fail();
 const r=row.receipt,p=row.proposal;
 if(r.owner_id!==actor||r.anchor_id!==a.id||r.status!=='committed'||!text(r.request_id)||!rec(r.request)||!rec(r.accepted_goal)||!rec(p.payload)||
 p.owner_id!==actor||p.anchor_id!==a.id||p.policy_version!==a.policy_version||!text(p.id)||typeof p.digest!=='string'||!/^[a-f0-9]{64}$/.test(p.digest)||
 p.consumed_request!==r.request_id||r.request.ownerId!==actor||r.request.requestId!==r.request_id||
 r.request.proposalId!==p.id||r.request.proposalDigest!==p.digest||requests.has(r.request_id)||proposals.has(p.id))return fail();
 const payload=p.payload,accepted=r.accepted_goal,old=payload.goalSnapshot,target=payload.target;
 if(!rec(old)||!rec(target)||old.user_id!==actor||old.is_active!==true||old.id!==payload.goalId||
 accepted.user_id!==actor||accepted.is_active!==true||accepted.id!==r.accepted_goal_id||!text(accepted.id)||goals.has(accepted.id)||
 !integer(old.daily_calories)||!integer(accepted.daily_calories)||!integer(payload.deltaKcal)||
 payload.deltaKcal===0||Math.abs(payload.deltaKcal)>200||accepted.daily_calories-old.daily_calories!==payload.deltaKcal||
 accepted.daily_calories!==target.calories||accepted.protein_g!==target.proteinG||accepted.carbs_g!==target.carbsG||
 accepted.fats_g!==target.fatsG||accepted.fiber_g!==target.fiberG||!rec(r.acceptance_evidence)||
 r.acceptance_evidence.contract!=='as-of-revalidated-v1'||typeof payload.sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(payload.sourceFingerprint)||r.acceptance_evidence.fingerprint!==payload.sourceFingerprint)return fail();
 const at=time(accepted.created_at);
 if(!Number.isFinite(at)||at<=last||!Number.isFinite(time(r.acceptance_evidence.capturedAt))||time(r.acceptance_evidence.capturedAt)>at||
 (prior?!same(old,prior):old.daily_calories!==a.baseline_intake_kcal))return fail();
 prior=accepted;last=at;net+=payload.deltaKcal;
 requests.add(r.request_id);proposals.add(p.id);goals.add(accepted.id);
 }
 if(!prior||!same(prior,g)||net!==a.accepted_delta_kcal||time(a.last_accepted_at)!==last)return fail();
 return {acceptedCount:rows.length,acceptedDelta:net,lastAcceptedAt:last,receiptsVerified:true};
}
