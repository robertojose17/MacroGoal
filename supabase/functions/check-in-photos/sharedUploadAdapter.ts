import {ensureDerivativeUpload} from './storeDerivative.ts';
// LOCAL CANDIDATE, no deployment before independent integration/security review.
import type {createClient} from 'https://esm.sh/@supabase/supabase-js@2.83.0';
import {createOriginalResolver} from './resolveOriginal.ts';
import {createSharedMediaUpload} from './sharedMediaUpload.ts';
export function createSharedUploadAdapter(admin: ReturnType<typeof createClient>, url:string) {return createSharedMediaUpload({
 authenticate:async(token)=>{const {data,error}=await admin.auth.getUser(token);return !error&&data.user?.is_anonymous===false?data.user.id:null;},
 ownsSource:async(actor,id)=>!!await createOriginalResolver({projectUrl:url,
 findOwnedPhoto:async(owner,photoId)=>{const {data,error}=await admin.from('check_in_photos').select('id,user_id,check_in_id,storage_path,photo_url').eq('id',photoId).eq('user_id',owner).maybeSingle();return error?null:data;},
 ownsCheckIn:async(owner,checkInId)=>{const {data,error}=await admin.from('check_ins').select('id').eq('id',checkInId).eq('user_id',owner).maybeSingle();return !error&&!!data;},
 })(actor,id),
 reserve:async(actor,source,key,digest)=>{const {data,error}=await admin.rpc('reserve_progress_media',{p_actor:actor,p_source:source,p_key:key,p_digest:digest});if(error)throw Error();return data;},
 uploadNew:async(path,bytes,mime,digest)=>ensureDerivativeUpload(admin.storage.from('community-progress-media'),path,bytes,mime,digest),
 markReady:async(actor,id,digest)=>{const {data,error}=await admin.rpc('ready_progress_media',{p_actor:actor,p_media:id,p_digest:digest});return !error&&data===true;},
 bind:async(actor,post,ids)=>{const {data,error}=await admin.rpc('bind_progress_media',{p_actor:actor,p_post:post,p_ids:ids});return !error&&data===true;},
});}
