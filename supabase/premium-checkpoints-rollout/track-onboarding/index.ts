import { handleLegacy } from './legacy.ts';
import { createOnboardingRouter } from './router.ts';
// Defer the private dependency graph; legacy startup retains its deployed dependency.
const route=createOnboardingRouter(handleLegacy,async(req:Request)=>{
 const { handleCheckpoint }=await import('./checkpoint.ts');
 return handleCheckpoint(req);
});
Deno.serve(route);
