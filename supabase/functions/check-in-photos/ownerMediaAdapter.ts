import {createSharedReadAdapter} from './sharedReadAdapter.ts';
// LOCAL CANDIDATE: deploy only after schema, policy and native-client review.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.83.0';
import { createPrivatePhotoMedia, type MediaReference } from './privatePhotoMedia.ts';
import { createOriginalResolver } from './resolveOriginal.ts';
const url=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
export function createOwnerMediaHandler(){ return async(req:Request)=>{
  // Request-local token only; no module-global auth state or logs.
  const token=req.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  const viewer=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
  return createPrivatePhotoMedia({
    authenticate:async(value)=>{const {data,error}=await admin.auth.getUser(value);return !error && data.user && data.user.is_anonymous === false?data.user.id:null;},
    resolve:async(actor,kind,id):Promise<MediaReference|null>=>{
      if(kind==='original')return createOriginalResolver({
        projectUrl:url,
        findOwnedPhoto:async(owner,photoId)=>{const {data,error}=await admin.from('check_in_photos').select('id,user_id,check_in_id,storage_path,photo_url').eq('id',photoId).eq('user_id',owner).maybeSingle();return error?null:data;},
        ownsCheckIn:async(owner,checkInId)=>{const {data,error}=await admin.from('check_ins').select('id').eq('id',checkInId).eq('user_id',owner).maybeSingle();return !error&&!!data;},
      })(actor,id);
      return createSharedReadAdapter(admin,viewer)(actor,id);
    },
    download:async(ref,signal)=>{
      const path=ref.path.split('/').map(encodeURIComponent).join('/');
      return fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(ref.bucket)}/${path}`,{
        headers:{Authorization:`Bearer ${service}`,apikey:service,'Cache-Control':'no-store'},redirect:'error',signal,
      });
    },
  })(req);
}; }
