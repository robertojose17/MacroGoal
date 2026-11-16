import type {Context} from '../release-candidates/tdee-adaptive-review/diagnosticFollowupController.ts';
export type FollowupAcceptedSnapshot={profile:{id:string;updated_at?:string|null;timezone?:string|null};goal:{id:string;user_id:string;updated_at?:string|null;is_active?:boolean|null}};
/** Binding only. Accepted editor snapshot is never an authorization/approval claim. */
export function followupContext(snapshot:FollowupAcceptedSnapshot|null|undefined):Context|null{
 if(!snapshot||snapshot.profile.id!==snapshot.goal.user_id||snapshot.goal.is_active!==true)return null;
 const {profile,goal}=snapshot;
 if(!profile.id||!goal.id||typeof goal.updated_at!=='string'||!goal.updated_at||typeof profile.updated_at!=='string'||!profile.updated_at||typeof profile.timezone!=='string'||!profile.timezone)return null;
 const scope={ownerId:profile.id,goalId:goal.id,goalRevision:goal.updated_at,profileUpdatedAt:profile.updated_at,timezone:profile.timezone};
 return {actor:profile.id,scope,revision:JSON.stringify(scope)};
}
export function followupCompletionOwns(current:{mounted:boolean;focused:boolean;foreground:boolean;blocked:boolean;revision:string|null;controller:unknown},captured:{revision:string;controller:unknown}){
 return current.mounted&&current.focused&&current.foreground&&!current.blocked&&current.revision===captured.revision&&current.controller===captured.controller;
}
