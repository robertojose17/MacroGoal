/** Only the configured issuer may validate this exact token. No user-data reads/writes. */
export function createIssuerAuthenticator(url:string,anon:string,request:typeof fetch=fetch){return async(token:string)=>{
 const response=await request(url+'/auth/v1/user',{method:'GET',headers:{apikey:anon,Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
 if(!response.ok)return null;const user=await response.json();
 const payload=token.split('.')[1];if(!payload)return null;
 const claims=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
 if(claims.aud!=='authenticated'||claims.sub!==user.id||claims.iss!==url+'/auth/v1'||(typeof claims.session_id!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(claims.session_id))||!Number.isSafeInteger(claims.exp)||user.is_anonymous===true)return null;
 return {ownerId:user.id,sessionId:claims.session_id,expiresAt:claims.exp*1000};
};}
