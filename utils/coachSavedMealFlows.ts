import {dailyAccess,type DailyAccess} from './coachDailyAction';
type Access=()=>DailyAccess;
export type SavedMealFlow={receiptId:string;mode:'cook'|'quick'|'eat_out';operation:'explore'|'import_discovery'|'estimate'|'prepare_general_estimate';date:string;savedAt:string;options:{name:string;authority:string}[]};
export type SavedMealList={kind:'ready';flows:SavedMealFlow[];truncated:boolean}|{kind:'unavailable'};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const operations=['explore','import_discovery','estimate','prepare_general_estimate'];
const authorities=['unknown','estimated','user_edited','official','publisher_reported'];
export function createSavedMealFlows(deps:{owner():Promise<string|undefined>;today():string;invoke(body:Record<string,unknown>):Promise<Response>}){
 const admitted=new WeakMap<SavedMealFlow,{owner:string;date:string;receiptId:string;mode:SavedMealFlow['mode']}>();
 const allowed=(a:Access)=>dailyAccess(a())==='ready';
 const same=async(owner:string,date:string,a:Access)=>allowed(a)&&await deps.owner()===owner&&deps.today()===date&&allowed(a);
 return {
  async list(access:Access):Promise<SavedMealList>{
   if(!allowed(access))return {kind:'unavailable'};
   try{const owner=await deps.owner(),date=deps.today();if(!owner||!await same(owner,date,access))return {kind:'unavailable'};
    const response=await deps.invoke({intent:'list_meal_flows'});if(!response.ok)return {kind:'unavailable'};
    const b=await response.json();if(!await same(owner,date,access)||b?.schema!=='meal_flow_list_v1'||!Array.isArray(b.flows)||b.flows.length>20||typeof b.truncated!=='boolean')return {kind:'unavailable'};
    const ids=new Set<string>(),flows:SavedMealFlow[]=[];
    for(const row of b.flows){if(!row||!uuid(row.receipt_id)||ids.has(row.receipt_id)||!operations.includes(row.operation)||!['cook','quick','eat_out'].includes(row.mode)||row.date!==date||typeof row.saved_at!=='string'||!Number.isFinite(Date.parse(row.saved_at))||!Array.isArray(row.options)||row.options.length<1||row.options.length>3||row.options.some((o:any)=>!o||typeof o.name!=='string'||!o.name.trim()||o.name.length>300||!authorities.includes(o.nutrition_authority)))return {kind:'unavailable'};
     ids.add(row.receipt_id);flows.push({receiptId:row.receipt_id,operation:row.operation,mode:row.mode,date:row.date,savedAt:row.saved_at,options:row.options.map((o:any)=>({name:o.name,authority:o.nutrition_authority}))});}
    for(const row of flows)admitted.set(row,{owner,date,receiptId:row.receiptId,mode:row.mode});return {kind:'ready',flows,truncated:b.truncated};
   }catch{return {kind:'unavailable'}}
  },
  // The selected reference must be the exact validated listing object. This
  // reads only the existing receipt; it cannot replay a paid operation.
  async recover(access:Access,flow:SavedMealFlow):Promise<{kind:'ready';owner:string;date:string;requestId:string;mode:SavedMealFlow['mode'];body:any}|{kind:'unavailable'}>{
   const scope=admitted.get(flow);if(!scope)return {kind:'unavailable'};
   try{if(!await same(scope.owner,scope.date,access))return {kind:'unavailable'};
    const response=await deps.invoke({intent:'recover_daily',request_id:scope.receiptId,journey:'meal_explore_v1'});if(!response.ok)return {kind:'unavailable'};
    const body=await response.json();if(!await same(scope.owner,scope.date,access)||body?.schema!=='meal_explore_v1'||body.owner!==scope.owner||body.date!==scope.date||body.status!=='options'||!Array.isArray(body.options)||!body.options.length||body.options.length>3)return {kind:'unavailable'};
    return {kind:'ready',owner:scope.owner,date:scope.date,requestId:scope.receiptId,mode:scope.mode,body};
   }catch{return {kind:'unavailable'}}
  }
 };
}
