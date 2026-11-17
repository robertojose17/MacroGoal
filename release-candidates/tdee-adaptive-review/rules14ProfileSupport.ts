/** Computed product age support only. Never a medical self-report or clearance. */
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function rules14ProfileSupportCurrent(s:any,owner:string,now:number):boolean{
 const q=s?.profileSupport,p=s?.profile,o=s?.observation,r=s?.readiness;
 if(!Number.isSafeInteger(now)||!q||q.version!=='rules14-profile-support-v1'||q.ownerId!==owner||p?.id!==owner||q.supported!==true||
 !date(q.dateOfBirth)||q.dateOfBirth!==p.dateOfBirth||q.dateOfBirth!==o?.sources?.dateOfBirth||!date(q.today)||q.today!==o?.context?.today||
 !hash(q.profileBinding)||!hash(q.journeyBinding)||q.profileBinding!==r?.profileBinding||q.journeyBinding!==r?.journeyBinding)return false;
 const captured=Date.parse(o?.capturedAt);
 if(!Number.isFinite(captured)||captured>now||now-captured>30000)return false;
 const age=+q.today.slice(0,4)- +q.dateOfBirth.slice(0,4)-(q.today.slice(5)<q.dateOfBirth.slice(5)?1:0);
 return Number.isSafeInteger(q.ageYears)&&q.ageYears===age&&age>=19&&age<=100;
}
