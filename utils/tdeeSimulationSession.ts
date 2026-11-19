/** Correlation only; authorization is always independently enforced by the server. Never log tokens. */
export function simulationSessionId(token:string):string|null{
 try{const parts=token.split('.');if(parts.length!==3)return null;const encoded=parts[1].replace(/-/g,'+').replace(/_/g,'/');const data=JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')));return typeof data.session_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.session_id)?data.session_id:null;}catch{return null;}
}
