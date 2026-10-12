import {createCorrelationKeys} from './correlationKey';
import {decodeCapturedJpeg} from './decodeCapturedJpeg';
import {supabase,SUPABASE_PROJECT_URL} from '@/lib/supabase/client';
import {privatePhotoGeneration} from '@/hooks/usePrivatePhoto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Nonsecret actor-scoped correlation only; all resource UUIDs originate at server.
export const freshPublicationKey=createCorrelationKeys();
export async function publicationActor(){const generation=privatePhotoGeneration();const {data:{session}}=await supabase.auth.getSession();if(!session||generation!==privatePhotoGeneration())throw Error('Session changed');return{id:session.user.id,generation};}
async function postMedia(path:string,body:BodyInit,contentType:string,key?:string){
 const generation=privatePhotoGeneration();const {data:{session}}=await supabase.auth.getSession();if(!session||generation!==privatePhotoGeneration())throw Error('Session changed');
 const response=await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos/shared/${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':contentType,'Cache-Control':'no-store',...(key?{'Idempotency-Key':key}:{})},body});
 if(generation!==privatePhotoGeneration())throw Error('Session changed');
 if(!response.ok)throw Error('Photo sharing unavailable');return response.json();
}
export async function uploadProgressDerivative(sourceId:string,uri:string,key:string):Promise<string>{
 if(!uuid.test(sourceId)||! /^[A-Za-z0-9:_-]{1,128}$/.test(key))throw Error('Invalid capture');
 const generation=privatePhotoGeneration();const bytes=decodeCapturedJpeg(uri);
 if(generation!==privatePhotoGeneration()||bytes.byteLength<3||bytes.byteLength>8*1024*1024)throw Error('Invalid capture');
 const data=await postMedia(`draft/${sourceId}`,bytes,'image/jpeg',key);if(!uuid.test(data.media_id))throw Error('Invalid response');return data.media_id;
}
export async function bindProgressDerivatives(postId:string,ids:string[]){if(!uuid.test(postId)||ids.some(id=>!uuid.test(id)))throw Error('Invalid publication');const data=await postMedia(`bind/${postId}`,JSON.stringify({media_ids:ids}),'application/json');if(data.bound!==true)throw Error('Sharing not confirmed');}
