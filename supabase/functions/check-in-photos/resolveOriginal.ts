import {ownedReference} from './photoReferenceGuard.ts';
import type {MediaReference} from './privatePhotoMedia.ts';
export type PhotoRow={id:string;user_id:string;check_in_id:string|null;storage_path:string;photo_url:string};
export function createOriginalResolver(deps:{projectUrl:string;findOwnedPhoto:(actor:string,id:string)=>Promise<PhotoRow|null>;ownsCheckIn:(actor:string,id:string)=>Promise<boolean>;
  // Explicit owner-byte route only. Shared upload intentionally omits this capability.
  ownerReadFallback?: {
    parentState:(actor:string,id:string)=>Promise<'owned'|'missing'|'foreign'|'error'>;
    objectExists:(ref:{bucket:string;path:string})=>Promise<boolean>;
  }
}){
 return async(actor:string,id:string):Promise<MediaReference|null>=>{
  const row=await deps.findOwnedPhoto(actor,id);
  if(!row||row.id!==id)return null;
  const ref=ownedReference(row,actor,deps.projectUrl);if(!ref)return null;
  let orphan=false;
  if(row.check_in_id){
    if(deps.ownerReadFallback){
      const state=await deps.ownerReadFallback.parentState(actor,row.check_in_id);
      if(state==='missing'){
        // Parent deletion must not erase access to a separately retained owned original.
        // Only exact immutable actor-prefix reference + existing canonical object can qualify.
        if(!await deps.ownerReadFallback.objectExists(ref))return null;
        orphan=true;
      } else if(state!=='owned')return null;
    } else if(!await deps.ownsCheckIn(actor,row.check_in_id))return null;
  }
  return {...ref,binding:`original:${row.id}:${row.user_id}:${row.check_in_id??''}${orphan?':orphan':''}`};
 };
}
