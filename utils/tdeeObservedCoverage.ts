/** Server-observed fourteen-day coverage. Never converts observations into consent. */
export type ObservedCoverageDay={date:string;contentHash:string;hasValidLoggedIntake:boolean};
export type TdeeObservedCoverage={version:'observed-log-coverage-v1';ownerId:string;capturedAt:string;dataBasis:'observed-logs-v1';coverageBasis:'observed_logs_not_confirmed_complete';profileBinding:string;journeyBinding:string;timezone:string;today:string;ageYears:number|null;completenessEstablished:false;clinicalEligibilityEstablished:false;days:ObservedCoverageDay[]};
const obj=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const day=(x:unknown):number|null=>{if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return null;const n=Date.parse(x+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x?n/86400000:null;};
export function parseObservedCoverage(raw:unknown,owner:string,now=Date.now()):TdeeObservedCoverage{
 const fail=():never=>{throw Error('observed_coverage_unverified');};
 if(!obj(raw)||Object.keys(raw).sort().join(',')!=='ageYears,capturedAt,clinicalEligibilityEstablished,completenessEstablished,coverageBasis,dataBasis,days,journeyBinding,ownerId,profileBinding,timezone,today,version'||raw.version!=='observed-log-coverage-v1'||raw.ownerId!==owner||raw.dataBasis!=='observed-logs-v1'||raw.coverageBasis!=='observed_logs_not_confirmed_complete'||raw.completenessEstablished!==false||raw.clinicalEligibilityEstablished!==false||!hash(raw.profileBinding)||!hash(raw.journeyBinding)||typeof raw.capturedAt!=='string'||!Number.isFinite(Date.parse(raw.capturedAt))||Date.parse(raw.capturedAt)>now||now-Date.parse(raw.capturedAt)>300000||!Array.isArray(raw.days)||raw.days.length>14||!(raw.ageYears===null||Number.isSafeInteger(raw.ageYears)))return fail();
 const end=day(raw.today);if(end===null||typeof raw.timezone!=='string')return fail();
 try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:raw.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(raw.capturedAt));const part=(n:string)=>parts.find(p=>p.type===n)?.value;if(`${part('year')}-${part('month')}-${part('day')}`!==raw.today)return fail();}catch{return fail();}
 let previous:number|null=null;
 for(const d of raw.days){if(!obj(d)||Object.keys(d).sort().join(',')!=='contentHash,date,hasValidLoggedIntake'||!hash(d.contentHash)||typeof d.hasValidLoggedIntake!=='boolean')return fail();const n=day(d.date);if(n===null||n<end-14||n>=end||(previous!==null&&n!==previous+1))return fail();previous=n;}
 if(previous!==null&&previous!==end-1)return fail();
 return structuredClone(raw) as TdeeObservedCoverage;
}
export function observedCoverage(state:TdeeObservedCoverage){return {usableLoggedDays:state.days.filter(d=>d.hasValidLoggedIntake).length,calendarDays:14,throughDate:state.days.at(-1)?.date??null};}
export async function requestObservedCoverage(input:{endpoint:string;apiKey:string;token:string;owner:string;signal:AbortSignal;isCurrent:()=>boolean;fetcher?:typeof fetch}):Promise<TdeeObservedCoverage>{
 const current=()=>!input.signal.aborted&&input.isCurrent();if(!current())throw Error('account_changed');
 const response=await(input.fetcher??fetch)(input.endpoint+'/rest/v1/rpc/tdee_read_observed_coverage_v1',{method:'POST',signal:input.signal,cache:'no-store',headers:{Authorization:'Bearer '+input.token,apikey:input.apiKey,'Content-Type':'application/json'},body:'{}'});
 if(!current())throw Error('account_changed');if(!response.ok)throw Error('observed_coverage_unavailable');const result=parseObservedCoverage(await response.json(),input.owner);if(!current())throw Error('account_changed');return result;
}
