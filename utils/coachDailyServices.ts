import {createCoachCatalogIdentity,type PublicCoachFood} from './coachCatalogIdentity';
import { createGuidedServices } from './coachGuidedServices';
import { createMealTransport } from './coachMealTransport';
import { createMealServices } from './coachMealServices';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { toLocalDateString } from './dateUtils';
import { createCoachDailyTransport } from './coachDailyTransport';
import { createManualHandoffServices } from './coachManualHandoff';

// UUID is a deduplication key, never an authorization secret. Matches the existing
// candidate journal's UUID algorithm without importing unrelated chat machinery.
const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
const transport = createCoachDailyTransport(supabase, AsyncStorage,
  `${SUPABASE_PROJECT_URL}:normal`,
  toLocalDateString, () => Intl.DateTimeFormat().resolvedOptions().timeZone, newId);

// Construction performs no I/O. All calls still enter premium/UI gates, server
// admission and strict response parsing.
const dailyServices = createManualHandoffServices({
  catalogSource: 'owned_saved_meals', owner: transport.owner, request: transport.request, recover: transport.recover,
});

// Verified ai-coach v204: reviewed 46-file manifest 67792e654b8d2623.
export const COACH_GUIDED_CONTRACT_READY = true;
const guidedServices = createGuidedServices({ owner: transport.owner, today: toLocalDateString, request: transport.request, recover: transport.recover, pendingGuidance: transport.pendingGuidance });
// Candidate contract is not deployed. Enable only after coordinated readback.
export const COACH_MEAL_V2_READY = true;
// Local conversational backend candidate; enable only after verified deployment.
export const COACH_CONVERSATION_READY = true;
const mealTransport = createMealTransport({ owner: transport.owner, today: toLocalDateString,
  zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone, newId, scope: `${SUPABASE_PROJECT_URL}:normal`, store: AsyncStorage,
  async invoke(body) {
    const result = await supabase.functions.invoke('ai-coach', { body });
    if (result.error) {
      if (result.error.context && typeof result.error.context.json === 'function') return result.error.context as Response;
      throw Error('dispatch_unknown');
    }
    return result.data && typeof result.data.text === 'function' && result.data.headers ? result.data as Response : new Response(JSON.stringify(result.data), { headers: { 'Content-Type': 'application/json' } });
  },
});
const catalogApi=supabase as unknown as {from(table:'foods'):{select(columns:string):{eq(column:'id',id:string):{maybeSingle():Promise<{data:Record<string,unknown>|null;error:unknown}>}};insert(row:PublicCoachFood):PromiseLike<{error:unknown}>}};
const catalogIdentity=createCoachCatalogIdentity({store:AsyncStorage,owner:transport.owner,
 async read(id){const {data,error}=await catalogApi.from('foods').select('id,name,serving_amount,serving_unit,calories,protein,carbs,fats,fiber,user_created,created_by').eq('id',id).maybeSingle();if(error)throw error;if(!data)return null;for(const k of ['serving_amount','calories','protein','carbs','fats','fiber']){const value=(data as any)[k];if(!['number','string'].includes(typeof value)||value===''||!Number.isFinite(Number(value)))throw Error('invalid_catalog_row');}return {...data,serving_amount:Number(data.serving_amount),calories:Number(data.calories),protein:Number(data.protein),carbs:Number(data.carbs),fats:Number(data.fats),fiber:Number(data.fiber)} as any;},
 async insert(row){const {error}=await catalogApi.from('foods').insert(row);if(error)throw error;}
});
const mealExperience = createMealServices({ catalogIdentity, transport: mealTransport, owner: transport.owner, today: toLocalDateString, store: AsyncStorage,
  subscribeInvalidation(owner, invalidate) { const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || session?.user?.id !== owner) invalidate(); }); return () => subscription.unsubscribe(); },
  async write(body) { const { error } = await supabase.rpc('log_food', body); if (error) throw error; },
});
export const coachDailyServices = { ...dailyServices, ...(COACH_GUIDED_CONTRACT_READY ? guidedServices : {}), ...(COACH_MEAL_V2_READY ? { experience: mealExperience } : {}) };
