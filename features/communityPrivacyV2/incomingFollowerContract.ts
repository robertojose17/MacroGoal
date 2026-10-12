/** LOCAL CONTRACT CANDIDATE, deliberately not connected to any Supabase client. */
export interface IncomingFollowerStatus {
 ownerUserId: string;
 requesterId: string;
 follow_request: null | { request_id: string; revision: string; state: 'accepted' };
}
export interface RemoveFollowerInput {
 p_requester_id: string;
 p_request_id: string;
 p_expected_revision: string;
}
export interface RemoveFollowerConfirmation {
 ownerUserId: string;
 requesterId: string;
 requestId: string;
 previousRevision: string;
 revision: string;
 state: 'revoked';
}
// Dedicated immutable caller-JWT POST transport names:
// get_incoming_follower_status({p_requester_id})
// remove_profile_follower(RemoveFollowerInput)
// Never call change_outbound_follow, direct tables, legacy social-follows or use service role.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function keys(value:unknown,names:string[]):value is Record<string,unknown>{
 return value!==null && typeof value==='object' && !Array.isArray(value)
 && Object.keys(value).length===names.length && names.every(k=>Object.hasOwn(value,k));
}
function revision(value:unknown):value is string{
 return typeof value==='string' && /^[1-9][0-9]{0,15}$/.test(value) && BigInt(value)<=9007199254740991n;
}
export function parseIncomingStatus(raw:unknown,owner:string,requester:string):IncomingFollowerStatus|null{
 if(!UUID.test(owner)||!UUID.test(requester)||owner===requester
 ||!keys(raw,['ownerUserId','requesterId','follow_request'])||raw.ownerUserId!==owner||raw.requesterId!==requester)return null;
 const d=raw.follow_request;
 if(d===null)return {ownerUserId:owner,requesterId:requester,follow_request:null};
 if(!keys(d,['request_id','revision','state'])||typeof d.request_id!=='string'||!UUID.test(d.request_id)||!revision(d.revision)||d.state!=='accepted')return null;
 return {ownerUserId:owner,requesterId:requester,follow_request:{request_id:d.request_id,revision:d.revision,state:'accepted'}};
}
export function parseRemoval(raw:unknown,owner:string,input:RemoveFollowerInput):RemoveFollowerConfirmation|null{
 if(!UUID.test(owner)||!UUID.test(input.p_requester_id)||owner===input.p_requester_id||!UUID.test(input.p_request_id)||!revision(input.p_expected_revision)
 ||!keys(raw,['ownerUserId','requesterId','requestId','previousRevision','revision','state'])
 ||raw.ownerUserId!==owner||raw.requesterId!==input.p_requester_id||raw.requestId!==input.p_request_id
 ||raw.previousRevision!==input.p_expected_revision||!revision(raw.revision)
 ||BigInt(raw.revision)!==BigInt(input.p_expected_revision)+1n||raw.state!=='revoked')return null;
 return {ownerUserId:owner,requesterId:input.p_requester_id,requestId:input.p_request_id,
 previousRevision:input.p_expected_revision,revision:raw.revision,state:'revoked'};
}
