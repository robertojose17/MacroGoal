import {createSimulationHandler} from './handler.ts';
import {createIssuerAuthenticator} from './auth.ts';
import {deploymentActivation} from './deploymentActivation.ts';
const url=Deno.env.get('SUPABASE_URL')??'',anon=Deno.env.get('SUPABASE_ANON_KEY')??'';
/** Gateway integration uses only deployment-scoped activation, never shared config overrides. */
export const handleSimulation=createSimulationHandler({now:()=>Date.now(),config:()=>deploymentActivation,authenticate:createIssuerAuthenticator(url,anon)});
