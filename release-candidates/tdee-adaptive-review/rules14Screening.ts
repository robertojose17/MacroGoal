/** Exact new risk-copy consent, never inferred from general-adult-v1. */
export function rules14ScreeningCurrent(s:any,owner:string,now:number):boolean{
 const q=s?.rulesScreening,r=s?.readiness;
 if(!q||q.version!=='rules-screening-v1'||q.copyVersion!=='rules-screening-copy-v1'||q.ownerId!==owner||q.current!==true||q.response!=='eligible'||
 q.profileBinding!==r?.profileBinding||q.journeyBinding!==r?.journeyBinding||q.profileUpdatedAt!==s?.profile?.updatedAt)return false;
 const accepted=Date.parse(q.acceptedAt),expires=Date.parse(q.expiresAt);
 return typeof q.acceptedAt==='string'&&typeof q.expiresAt==='string'&&Number.isFinite(accepted)&&Number.isFinite(expires)&&accepted<=now&&expires>now&&expires>accepted;
}
