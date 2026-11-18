import type {ObservationProgram} from './dynamicTdeeObservation';
/** Compact read-only state; program authority precedes estimate reasons, not the model's paused label. */
export function dashboardBurnStatus({program,loading,error}:{program:ObservationProgram|null;loading:boolean;error:string|null},es:boolean):string|null{
 const pick=(en:string,sp:string)=>es?sp:en,unavailable=pick('Unavailable','No disponible');
 if(loading)return pick('Loading…','Cargando…');
 if(error||!program||!program.premium||!program.enabled)return unavailable;
 const e=program.estimate;if(!e)return unavailable;
 if(e.status==='estimated'&&e.reason==='ready')return null;
 if(e.status==='collecting'&&['insufficient_weights','insufficient_history'].includes(e.reason))return pick('More weigh-ins needed','Faltan pesajes');
 if(e.status==='paused'&&e.reason==='missing_intake')return pick('More food records needed','Faltan registros de comida');
 if(e.status==='stale'&&e.reason==='stale_weight')return pick('Recent weigh-in needed','Falta un pesaje reciente');
 return unavailable;
}
