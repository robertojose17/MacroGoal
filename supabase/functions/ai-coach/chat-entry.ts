import {guardedChat} from './chat-access.ts';
import {compatibleCoach} from './compatibility.ts';
import {boundLegacyMealChat} from './chat-meal-boundary.ts';
import type {Access} from './_shared/coach-access.ts';
type Handler=(req:Request)=>Promise<Response>;
// Shared by the Deno entrypoint and composition regressions. Protocol ownership
// is decided before any local handoff: every present modern ID, even null, goes
// through modern validation/admission/replay unchanged.
export function createGuardedConversation(db:any,legacy:Handler,modern:Handler,enabled:()=>boolean,resolve?:(owner:string,now:number)=>Promise<Access>,now=Date.now){
 const legacyConversation:Handler=req=>boundLegacyMealChat(req,legacy);
 return guardedChat(db,compatibleCoach(legacyConversation,modern,enabled),resolve,now);
}
