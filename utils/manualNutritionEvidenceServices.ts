import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {supabase,SUPABASE_PROJECT_URL,supabasePublicKey} from '@/lib/supabase/client';
import {createManualNutritionEvidenceTransport} from './manualNutritionEvidenceTransport';
import {createManualNutritionEvidenceJournal} from './manualNutritionEvidenceJournal';
import {createManualNutritionEvidenceController} from './manualNutritionEvidenceController';
/** Reviewed manual-entry metadata release. TDEE recommendation release is separate and remains OFF. */
export const MANUAL_NUTRITION_EVIDENCE_ENABLED=true;
/** Requests use the signed-in account. Journal contains nutrition requests, never tokens. */
export function makeManualNutritionEvidenceServices(isCurrent:(owner:string)=>boolean){
 if(!MANUAL_NUTRITION_EVIDENCE_ENABLED)throw Error('manual_evidence_disabled');
 const transport=createManualNutritionEvidenceTransport({auth:supabase.auth,fetch:(url,init)=>fetch(url,init),projectUrl:SUPABASE_PROJECT_URL,publicKey:supabasePublicKey,isCurrent});
 const journal=createManualNutritionEvidenceJournal(AsyncStorage);
 const invalidRecords=new Map<string,{owner:string;raw:string;storageKey?:string}>();
 const controller=createManualNutritionEvidenceController({...transport,journal,newRequestId:()=>Crypto.randomUUID()});
 return {beginConfirmedLog:controller.beginConfirmedLog,recover:controller.recover,
  pending:async(owner:string,item:string)=>{await transport.requireSession(owner);const entries=await journal.listPending(owner,item);await transport.requireSession(owner);return entries.map(entry=>entry.request.requestId);},
  listPending:async(owner:string)=>{
   await transport.requireSession(owner);
   const entries=await journal.inspectOwnerPending(owner);
   await transport.requireSession(owner);
   invalidRecords.clear();
   const reservedIds=new Set(entries.flatMap(record=>record.kind==='valid'?[record.entry.request.requestId]:record.kind==='invalid'?[record.requestId]:[]));
   return entries.map(record=>{
    if(record.kind==='valid')return {itemId:record.entry.itemId,requestId:record.entry.request.requestId};
    const requestId=record.kind==='invalid-key'?Crypto.randomUUID():record.requestId;
    if(invalidRecords.has(requestId) || (record.kind==='invalid-key' && reservedIds.has(requestId)))throw Error('local_descriptor_collision');
    reservedIds.add(requestId);
    invalidRecords.set(requestId,{owner,raw:record.raw,...(record.kind==='invalid-key'?{storageKey:record.storageKey}:{})});
    return {itemId:null,requestId,invalid:true as const};
   });
  },
  discardPending:async(owner:string,item:string|null,requestId:string)=>{
   await transport.requireSession(owner);
   if(item===null){
    const record=invalidRecords.get(requestId);
    if(!record || record.owner!==owner)throw Error('invalid_journal');
    const cleared=record.storageKey===undefined
     ?await journal.discardInvalidExact(owner,requestId,record.raw)
     :await journal.discardInvalidKeyExact(owner,record.storageKey,record.raw);
    await transport.requireSession(owner);
    if(cleared)invalidRecords.delete(requestId);
    return cleared;
   }
   const entry=await journal.read(owner,requestId);
   await transport.requireSession(owner);
   if(entry===null)return true;
   if(entry.itemId!==item)throw Error('invalid_journal');
   // Explicit local-only cleanup. Never revokes server evidence or changes the saved food.
   const cleared=await journal.clearExact(owner,requestId,entry);
   await transport.requireSession(owner);
   return cleared;
  },
  dispose:()=>{invalidRecords.clear();controller.deactivate();transport.dispose();}
 };
}
