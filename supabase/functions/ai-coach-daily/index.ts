import {createInternalWorkerDispatcher} from '../../../release-candidates/tdee-adaptive-review/internalWorkerDispatcher.ts';
// Existing compatibility response is preserved for every non-internal request.
// Deno's runtime supplies its declarations; no runtime API import is needed.
const compatibility=async(_req:Request)=>new Response(JSON.stringify({ok:true,message:"Use ai-coach instead"}),{status:200,headers:{"Content-Type":"application/json"}});
Deno.serve(createInternalWorkerDispatcher(compatibility,()=>import('../../../release-candidates/tdee-adaptive-review/internalWorkerEdgeHandler.ts')));
