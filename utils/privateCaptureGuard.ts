export async function capturePrivatePhoto(deps:{renderGeneration:number;generation:()=>number;capture:()=>Promise<string>;release:(uri:string)=>void|Promise<void>}):Promise<string>{
 if(deps.generation()!==deps.renderGeneration)throw Error('Private photo session changed');
 const uri=await deps.capture();
 if(deps.generation()!==deps.renderGeneration){await deps.release(uri);throw Error('Private photo session changed');}
 return uri;
}
