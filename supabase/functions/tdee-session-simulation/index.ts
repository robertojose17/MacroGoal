import {readSimulationConfig} from './config.ts';
import {createSimulationHandler} from './handler.ts';
import {createIssuerAuthenticator} from './auth.ts';
const url=Deno.env.get('SUPABASE_URL')??'',anon=Deno.env.get('SUPABASE_ANON_KEY')??'';
Deno.serve(createSimulationHandler({now:()=>Date.now(),config:()=>readSimulationConfig(Deno.env.get('TDEE_SESSION_SIMULATION_CONFIG_JSON')),authenticate:createIssuerAuthenticator(url,anon)}));
