/** Private configured Supabase ports. No keys or actor identities from HTTP bodies. */
import {createSnapshotServerRuntime,SNAPSHOT_SERVER_RPC,type SnapshotServerDependencies} from './snapshotServerRuntime.ts';
type Result={data:unknown;error:unknown};
type SupabaseClient={
 auth:{getUser(token:string):Promise<{data:{user:{id:string}|null}|null;error:unknown}>};
 rpc(name:string,args?:Record<string,unknown>):PromiseLike<Result>;
};
type ClientOptions={auth:{persistSession:false;autoRefreshToken:false;detectSessionInUrl:false};global?:{headers:{Authorization:string}}};
export type SnapshotSupabaseConfig={
 url:string;anonKey:string;serviceKey:string;
 createClient(url:string,key:string,options:ClientOptions):SupabaseClient;
};
/** Server module port construction is exported for isolated contract tests, not an API. */
export function createSnapshotSupabasePorts(config:SnapshotSupabaseConfig):SnapshotServerDependencies{
 const {url,anonKey,serviceKey,createClient}=config;
 if(typeof url!=='string'||!url.startsWith('https://')||typeof anonKey!=='string'||!anonKey||typeof serviceKey!=='string'||!serviceKey)
  throw new Error('server_configuration_required');
 const options=()=>({auth:{persistSession:false as const,autoRefreshToken:false as const,detectSessionInUrl:false as const}});
 const own=(token:string)=>createClient(url,anonKey,{...options(),global:{headers:{Authorization:'Bearer '+token}}});
 // This object is only constructed on issuance, after server validation. It never
 // receives the user's bearer, so issuer privileges cannot depend on user input.
 let service:SupabaseClient|undefined;
 return {
  async verifyAccessToken(token){
   const result=await own(token).auth.getUser(token);
   if(result.error||!result.data?.user||typeof result.data.user.id!=='string')return null;
   return {id:result.data.user.id};
  },
  async loadOwnContext(token,rpc){
   if(rpc!==SNAPSHOT_SERVER_RPC.read)throw new Error('source_error');
   const result=await own(token).rpc(SNAPSHOT_SERVER_RPC.read);
   if(result.error)throw new Error('source_error');
   return result.data;
  },
  async issueAsService(rpc,args){
   if(rpc!==SNAPSHOT_SERVER_RPC.issue)throw new Error('source_error');
   service??=createClient(url,serviceKey,options());
   const result=await service.rpc(SNAPSHOT_SERVER_RPC.issue,structuredClone(args));
   if(result.error)throw new Error('source_error');
   return result.data;
  }
 };
}
export function createSnapshotSupabaseRuntime(config:SnapshotSupabaseConfig){
 return createSnapshotServerRuntime(createSnapshotSupabasePorts(config));
}
