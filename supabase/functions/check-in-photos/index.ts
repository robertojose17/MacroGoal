// LOCAL REVIEW CANDIDATE — not deployed. Authenticated media client cutover required.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.83.0';
import { ownedReference, checkInId, uploadType } from './photoReferenceGuard.ts';
const PROJECT = Deno.env.get('SUPABASE_URL')!;
const ACTIVE = 'progress-photos';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const descriptor=(p:any,r:{bucket:string;path:string})=>({id:p.id,user_id:p.user_id,check_in_id:p.check_in_id,storage_bucket:r.bucket,storage_path:r.path,created_at:p.created_at,photo_url:null});
async function boundedBody(req:Request,max:number):Promise<string>{
  if(Number(req.headers.get('Content-Length')??0)>max)throw Error('Body too large');
  if(!req.body)return ''; const reader=req.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>max){await reader.cancel();throw Error('Body too large');}chunks.push(result.value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
    const header=req.headers.get('Authorization');
    if(!header?.startsWith('Bearer ')||header.length>12000)return reply({error:'Unauthorized'},401);
    const db=createClient(PROJECT,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:authError}=await db.auth.getUser(header.slice(7));
    if(authError||!user||user.is_anonymous!==false)return reply({error:'Unauthorized'},401);
    const actor=user.id;
    const route=new URL(req.url);
    const prefix=['/functions/v1/check-in-photos','/check-in-photos'].find(p=>route.pathname===p||route.pathname.startsWith(p+'/'));
    const suffix=prefix?route.pathname.slice(prefix.length):undefined;
    if(suffix===undefined||route.search)return reply({error:'Invalid request'},400);
    if(req.method==='POST'&&suffix==='/upload-url'){
      const body=await boundedBody(req,2048);
      const data=JSON.parse(body);if(!uploadType(data.content_type))return reply({error:'Unsupported image type'},400);
      const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic'} as Record<string,string>)[data.content_type];
      const path=`${actor}/${crypto.randomUUID()}.${ext}`;
      const {data:signed,error}=await db.storage.from(ACTIVE).createSignedUploadUrl(path);
      if(error||!signed)return reply({error:'Photo upload unavailable'},503);
      // Backward-compatible locator only: bucket is private after reviewed cutover.
      const locator=`${PROJECT}/storage/v1/object/public/${ACTIVE}/${path}`;
      return reply({upload_url:signed.signedUrl,storage_path:path,public_url:locator});
    }
    if(req.method==='POST'&&(suffix===''||suffix==='/')){
      const text=await boundedBody(req,4096);
      const body=JSON.parse(text);
      const ref=ownedReference({user_id:actor,storage_path:body.storage_path,photo_url:body.photo_url},actor,PROJECT);
      if(!ref||ref.bucket!==ACTIVE||!checkInId(body.check_in_id))return reply({error:'Invalid photo reference'},400);
      if(body.check_in_id){const {data,error}=await db.from('check_ins').select('id').eq('id',body.check_in_id).eq('user_id',actor).maybeSingle();if(error||!data)return reply({error:'Check-in not found'},404);}
      const {data:info,error:infoError}=await db.storage.from(ACTIVE).info(ref.path);
      if(infoError||!info||info.name!==ref.path||info.bucketId!==ACTIVE||!uploadType(info.contentType)||typeof info.size!=='number'||!Number.isFinite(info.size)||info.size<=0||info.size>10*1024*1024)return reply({error:'Uploaded photo not available'},400);
      const {data:photo,error}=await db.from('check_in_photos').insert({user_id:actor,check_in_id:body.check_in_id??null,photo_url:body.photo_url,storage_path:ref.path}).select('id,user_id,check_in_id,photo_url,storage_path,created_at').single();
      if(error||!photo)return reply({error:'Photo could not be saved'},503);
      return reply({photo:descriptor(photo,ref)});
    }
    if(req.method==='DELETE'&&/^\/[0-9a-f-]{36}$/.test(suffix)){
      const id=suffix.slice(1);if(!checkInId(id))return reply({error:'Invalid request'},400);
      const {data:photo,error}=await db.from('check_in_photos').select('id,user_id,photo_url,storage_path').eq('id',id).eq('user_id',actor).maybeSingle();
      const ref=photo&&ownedReference(photo,actor,PROJECT);
      if(error||!photo||!ref)return reply({error:'Photo not found'},404);
      const {error:removeError}=await db.storage.from(ref.bucket).remove([ref.path]);
      if(removeError)return reply({error:'Photo could not be removed'},503);
      const {data:removedRows,error:rowError}=await db.from('check_in_photos').delete().eq('id',id).eq('user_id',actor).eq('storage_path',ref.path).eq('photo_url',photo.photo_url).select('id');
      if(rowError||!removedRows||removedRows.length!==1)return reply({error:'Photo record could not be removed'},503);
      return reply({success:true});
    }
    if(req.method==='GET'&&(suffix===''||suffix==='/')){
      const {data:photos,error}=await db.from('check_in_photos').select('id,user_id,check_in_id,photo_url,storage_path,created_at').eq('user_id',actor).order('created_at',{ascending:true});
      if(error)return reply({error:'Photos unavailable'},503);
      const allowed=(photos??[]).flatMap((p:any)=>{const r=ownedReference(p,actor,PROJECT);return r?[descriptor(p,r)]:[];});
      return reply({photos:allowed,unavailable_count:(photos??[]).length-allowed.length});
    }
    return reply({error:'Method not allowed'},405);
  }catch{return reply({error:'Invalid request'},400);}
});
