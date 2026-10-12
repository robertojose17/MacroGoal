import {ownedReference} from './photoReferenceGuard.ts';
import type {MediaReference} from './privatePhotoMedia.ts';
export type PhotoRow={id:string;user_id:string;check_in_id:string|null;storage_path:string;photo_url:string};
export function createOriginalResolver(deps:{projectUrl:string;findOwnedPhoto:(actor:string,id:string)=>Promise<PhotoRow|null>;ownsCheckIn:(actor:string,id:string)=>Promise<boolean>}){
 return async(actor:string,id:string):Promise<MediaReference|null>=>{
  const row=await deps.findOwnedPhoto(actor,id);
  if(!row||row.id!==id)return null;
  const ref=ownedReference(row,actor,deps.projectUrl);if(!ref)return null;
  if(row.check_in_id&&!await deps.ownsCheckIn(actor,row.check_in_id))return null;
  return {...ref,binding:`original:${row.id}:${row.user_id}:${row.check_in_id??''}`};
 };
}
