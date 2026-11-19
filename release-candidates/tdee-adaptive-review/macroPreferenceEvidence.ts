import type {SnapshotMacroRequest,SnapshotMacroEvidence} from './snapshotReviewContextParser.ts';
/** Only validates a read from the authenticated own-actor RPC, never request body data.
 * Preference provenance is separate from nutritional review and final proposal acceptance.
 */
export function macroPreferenceEvidence(actor:string,request:SnapshotMacroRequest,value:unknown,now:number):SnapshotMacroEvidence{
 const requestCopy=structuredClone(request);
 const out:SnapshotMacroEvidence={version:'snapshot-macro-evidence-v1',request:requestCopy,review:null,consent:null,preferenceStatus:'invalid'};
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const stamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
 const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
 if(!uuid(actor)||requestCopy.binding.ownerId!==actor||!object(value))return out;
 const captured=stamp(value.capturedAt),source=stamp(requestCopy.sourceCapturedAt),c=value.choice;
 if(!Number.isFinite(stamp(requestCopy.binding.goalRevision))||!Number.isFinite(now)||!Number.isFinite(source)||source>now||now-source>30000||
  !Number.isFinite(captured)||captured<source||captured>now||now-captured>30000||
  value.version!=='macro-choice-state-v1'||value.actionable!==false||value.ownerId!==actor||
  value.copyVersion!=='macro-choice-v1'||value.bindingStatus!=='available'||
  value.goalId!==requestCopy.binding.goalId||value.goalUpdatedAt!==requestCopy.binding.goalRevision||
  value.profileBinding!==requestCopy.profileBinding||value.journeyBinding!==requestCopy.journeyBinding)return out;
 if(c===null&&value.choiceVersion===0){out.preferenceStatus='absent';return out;}
 if(!object(c)||!['smart','preserve_percent','revoked'].includes(c.mode as string)||
  typeof c.current!=='boolean'||c.copyVersion!=='macro-choice-v1'||
  !Number.isSafeInteger(value.choiceVersion)||(value.choiceVersion as number)<1||c.choiceVersion!==value.choiceVersion||!uuid(c.requestId))return out;
 if(c.mode==='revoked'){
  if(c.splitBps===null&&c.current===false)out.preferenceStatus='revoked';
  return out;
 }
 if(c.current!==true||c.goalUpdatedAt!==requestCopy.binding.goalRevision||
  c.profileBinding!==requestCopy.profileBinding||c.journeyBinding!==requestCopy.journeyBinding){
  out.preferenceStatus='stale';return out;
 }
 const split=c.splitBps;
 if(c.mode==='smart'&&split!==null)return out;
 if(c.mode==='preserve_percent'&&(!object(split)||Object.keys(split).length!==3||
  !['protein','carbs','fats'].every(k=>Number.isSafeInteger(split[k])&&(split[k] as number)>=0&&(split[k] as number)<=10000)||
  (split.protein as number)+(split.carbs as number)+(split.fats as number)!==10000))return out;
 const recorded=stamp(c.recordedAt);
 // A choice made after the source capture needs a new snapshot, not retroactive binding.
 if(!Number.isFinite(recorded)||recorded<0||recorded>source)return out;
 out.preferenceStatus='current';
 out.consent={mode:c.mode as 'smart'|'preserve_percent',binding:structuredClone(requestCopy.binding),consentId:c.requestId as string,acceptedAt:recorded,choiceVersion:value.choiceVersion as number,splitBps:structuredClone(split) as {protein:number;carbs:number;fats:number}|null};
 return out;
}

