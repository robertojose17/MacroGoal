/** Exact new risk-copy self-report, never inferred from general-adult-v1.
 * Saved validity uses risk/profile and journey bindings. User-row telemetry is not consent expiry.
 * The captured timestamp remains well-formed evidence; SQL insert still checks its exact concurrency version. */
export function rules14ScreeningCurrent(s:any,owner:string,now:number):boolean{
 const q=s?.rulesScreening,r=s?.readiness;
 const binding=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!q||q.version!=='rules-screening-v1'||q.copyVersion!=='rules-screening-copy-v1'||q.ownerId!==owner||q.current!==true||q.response!=='eligible'||
 !binding(q.profileBinding)||!binding(q.journeyBinding)||q.profileBinding!==r?.profileBinding||q.journeyBinding!==r?.journeyBinding||typeof q.profileUpdatedAt!=='string'||!Number.isFinite(Date.parse(q.profileUpdatedAt)))return false;
 const accepted=Date.parse(q.acceptedAt),expires=Date.parse(q.expiresAt);
 return typeof q.acceptedAt==='string'&&typeof q.expiresAt==='string'&&Number.isFinite(accepted)&&Number.isFinite(expires)&&accepted<=now&&expires>now&&expires>accepted;
}

