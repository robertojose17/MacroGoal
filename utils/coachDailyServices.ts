import { createGuidedServices } from './coachGuidedServices';
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
export const coachDailyServices = { ...dailyServices, ...(COACH_GUIDED_CONTRACT_READY ? guidedServices : {}) };
