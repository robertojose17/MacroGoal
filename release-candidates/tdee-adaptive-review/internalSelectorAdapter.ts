/** Fixed service-only selector calls. No HTTP body or JWT actor, no new credentials. */
export const INTERNAL_SELECTOR_RELEASE_STATE=Object.freeze({enabled:true} as const);
export type SelectorSelection={ownerId:string;contextRevision:string};
export type SelectorPorts={serviceRpc(name:string,args:Record<string,unknown>,signal:AbortSignal):Promise<unknown>;now?:()=>number};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const uuid=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const selected=(x:unknown):x is SelectorSelection=>obj(x)&&Object.keys(x).length===2&&uuid(x.ownerId)&&hash(x.contextRevision);
const unavailable=()=>new Error('internal_selection_unavailable');
const fresh=(v:Record<string,unknown>,now:number)=>v.actionable===false&&Number.isSafeInteger(v.capturedAt)&&(v.capturedAt as number)>=0&&(v.capturedAt as number)<=now&&now-(v.capturedAt as number)<=30000;
/** Pure decoder does not authenticate a service result. Only fixed service RPC supplies it. */
export function decodeDueSelections(value:unknown,limit:number,now:number):SelectorSelection[]{
 if(!Number.isSafeInteger(limit)||limit<1||limit>25||!Number.isSafeInteger(now)||!obj(value))throw unavailable();
 if(value.status==='busy'||value.status==='disabled')return [];
 if(value.status!=='selected'||!fresh(value,now)||!Array.isArray(value.owners)||value.owners.length>limit||
  !Number.isSafeInteger(value.scanned)||(value.scanned as number)<value.owners.length||(value.scanned as number)>250)throw unavailable();
 const seen=new Set<string>();
 for(const s of value.owners){if(!selected(s)||seen.has(s.ownerId.toLowerCase()))throw unavailable();seen.add(s.ownerId.toLowerCase());}
 return structuredClone(value.owners) as SelectorSelection[];
}
export function decodeCurrentSelection(value:unknown,selection:SelectorSelection,now:number):SelectorSelection&{enrolled:true;accountActive:true}{
 if(!selected(selection)||!Number.isSafeInteger(now)||!obj(value)||value.status!=='current'||!fresh(value,now)||!obj(value.selection))throw unavailable();
 const s=value.selection;
 if(Object.keys(s).length!==4||s.ownerId!==selection.ownerId||s.contextRevision!==selection.contextRevision||s.enrolled!==true||s.accountActive!==true)throw unavailable();
 return {...selection,enrolled:true,accountActive:true};
}
/** Unmounted source-review wiring; injected service ports only. Runtime facade below OFF. */
export function createSelectorReviewPorts(ports:SelectorPorts){
 const now=ports.now??Date.now;
 return {
  async selectDueOwners(limit:number,deadline:number,signal:AbortSignal){
   const t=now();if(!Number.isSafeInteger(t)||!Number.isSafeInteger(deadline)||deadline<=t||deadline>t+5000||!Number.isSafeInteger(limit)||limit<1||limit>25||signal.aborted)throw unavailable();
   const v=await ports.serviceRpc('tdee_internal_select_due_v1',{p_limit:limit,p_deadline_ms:deadline},signal);
   const after=now();if(signal.aborted||after<t||after>=deadline)throw unavailable();return decodeDueSelections(v,limit,after);
  },
  async readCurrentSelection(selection:SelectorSelection,signal:AbortSignal){
   const t=now();if(!Number.isSafeInteger(t)||!selected(selection)||signal.aborted)throw unavailable();
   const v=await ports.serviceRpc('tdee_internal_current_selection_v1',{p_owner:selection.ownerId,p_context_revision:selection.contextRevision},signal);
   const after=now();if(signal.aborted||after<t)throw unavailable();return decodeCurrentSelection(v,selection,after);
  },
 };
}
export function createInternalSelectorPorts(ports:SelectorPorts){
 const reviewed=createSelectorReviewPorts(ports);
 return {
  async selectDueOwners(limit:number,deadline:number,signal:AbortSignal){if(!INTERNAL_SELECTOR_RELEASE_STATE.enabled)return [];return reviewed.selectDueOwners(limit,deadline,signal);},
  async readCurrentSelection(selection:SelectorSelection,signal:AbortSignal){if(!INTERNAL_SELECTOR_RELEASE_STATE.enabled)throw new Error('safety_review_required');return reviewed.readCurrentSelection(selection,signal);},
 };
}
