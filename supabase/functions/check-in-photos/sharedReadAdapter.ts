import {createSharedResolver} from './resolveShared.ts';
export function createSharedReadAdapter(admin:any,viewer:any){return createSharedResolver({
 findMapping:async(id)=>{const {data,error}=await admin.from('progress_post_media').select('id,owner_id,post_id,state,sha256,slot').eq('id',id).maybeSingle();return error||!data?null:{...data,object_path:`${data.owner_id}/${data.id}`};},
 findVisiblePost:async(id)=>{const {data,error}=await viewer.from('social_posts').select('id,user_id,is_public,audience,section,progress_stats').eq('id',id).maybeSingle();return error?null:data;},
 canViewProfile:async(owner)=>{const {data,error}=await viewer.rpc('can_view_profile',{p_target:owner});return !error&&data===true;},
 canAccessClub:async(actor)=>{const {data,error}=await admin.rpc('can_read_progress_club',{p_actor:actor});return !error&&data===true;},
});}
