/** Explicit self-report only. Never infers completeness or clinical eligibility. */
export type EligibilityResponse = 'criteria_confirmed' | 'not_confirmed' | 'unsure';
export type ReadinessDay = {date:string; contentHash:string; confirmable:boolean; confirmed:boolean};
export type TdeeReadiness = {version:'tdee-readiness-v1'; ownerId:string; capturedAt:string; questionnaireVersion:'general-adult-v1'; statementVersion:'complete-day-v1'; profileBinding:string; journeyBinding:string; timezone:string; today:string; eligibility:{response:EligibilityResponse|null; current:boolean; adult:boolean}; days:ReadinessDay[]};
const object = (v:unknown):Record<string,unknown> => { if(!v || typeof v!=='object'||Array.isArray(v))throw Error('invalid_readiness');return v as Record<string,unknown>; };
const str=(v:unknown):string=>{if(typeof v!=='string'||!v.length||v.length>512)throw Error('invalid_readiness');return v;};
const hash=(v:unknown):string=>{const s=str(v);if(!/^[a-f0-9]{64}$/.test(s))throw Error('invalid_readiness');return s;};
const day=(v:unknown):string=>{const s=str(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s+'T12:00:00Z').toISOString().slice(0,10)!==s)throw Error('invalid_readiness');return s;};
export function parseTdeeReadiness(raw:unknown,owner:string,now=Date.now()):TdeeReadiness {
 const v=object(raw), e=object(v.eligibility),today=day(v.today),capturedAt=str(v.capturedAt);
 if(v.version!=='tdee-readiness-v1'||v.ownerId!==owner||v.questionnaireVersion!=='general-adult-v1'||v.statementVersion!=='complete-day-v1'||typeof e.current!=='boolean'||typeof e.adult!=='boolean'||!(e.response===null||['criteria_confirmed','not_confirmed','unsure'].includes(String(e.response)))||!Number.isFinite(Date.parse(capturedAt))||Math.abs(now-Date.parse(capturedAt))>300000||!Array.isArray(v.days)||v.days.length>29)throw Error('invalid_readiness');
 const timezone=str(v.timezone);try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{throw Error('invalid_readiness');}
 const seen=new Set<string>();
 const days=v.days.map(rawDay=>{const d=object(rawDay),date=day(d.date),distance=(Date.parse(today)-Date.parse(date))/86400000;
 if(distance<1||distance>29||seen.has(date)||typeof d.confirmable!=='boolean'||typeof d.confirmed!=='boolean')throw Error('invalid_readiness');seen.add(date);
 return {date,contentHash:hash(d.contentHash),confirmable:d.confirmable,confirmed:d.confirmed};});
 return {version:'tdee-readiness-v1',ownerId:owner,capturedAt,questionnaireVersion:'general-adult-v1',statementVersion:'complete-day-v1',profileBinding:hash(v.profileBinding),journeyBinding:hash(v.journeyBinding),timezone,today,eligibility:{response:e.response as EligibilityResponse|null,current:e.current,adult:e.adult},days};
}
export function readinessDayChanges(state:TdeeReadiness,selected:ReadonlySet<string>):Pick<ReadinessDay,'date'|'contentHash'|'confirmed'>[] {
 if([...selected].some(date=>!state.days.some(d=>d.date===date)))throw Error('invalid_days');
 return state.days.filter(d=>d.confirmed!==selected.has(d.date)).map(d=>{const confirmed=selected.has(d.date);if(confirmed&&!d.confirmable)throw Error('invalid_days');return {date:d.date,contentHash:d.contentHash,confirmed};});
}
export async function requestTdeeReadiness(input:{endpoint:string;apiKey:string;token:string;owner:string;signal:AbortSignal;isCurrent:()=>boolean;mutation?:Record<string,unknown>;fetcher?:typeof fetch}):Promise<TdeeReadiness>{
 const current=()=>!input.signal.aborted&&input.isCurrent();if(!current())throw Error('account_changed');
 const response=await (input.fetcher??fetch)(input.endpoint+'/rest/v1/rpc/'+(input.mutation?'tdee_confirm_readiness_v1':'tdee_read_readiness_v1'),{method:'POST',signal:input.signal,cache:'no-store',headers:{Authorization:'Bearer '+input.token,apikey:input.apiKey,'Content-Type':'application/json'},body:JSON.stringify(input.mutation?{p_request:input.mutation}:{})});
 if(!current())throw Error('account_changed');if(!response.ok)throw Error(response.status===409?'readiness_conflict':'readiness_unavailable');
 const value=parseTdeeReadiness(await response.json(),input.owner);if(!current())throw Error('account_changed');return value;
}
