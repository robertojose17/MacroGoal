import type {ObservationProgram} from './dynamicTdeeObservation';
/** Presentation only. Never infers intake, rates, targets or entitlement. */
export function observationStatus(program:ObservationProgram|null,loading:boolean,error:string|null){
 if(loading)return 'loading';
 if(error||!program)return 'unavailable';
 if(!program.premium)return 'premium_required';
 if(!program.enabled)return 'paused';
 return program.estimate?.status??'collecting';
}
export function observationStatusText(status:string,es:boolean):string{
 const copy:Record<string,[string,string]>={
 loading:['Checking your latest data…','Comprobando tus datos recientes…'],
 unavailable:['Estimate unavailable. Your saved targets have not been replaced by an estimate.','Estimación no disponible. No se ha sustituido tu meta guardada por una estimación.'],
 premium_required:['Dynamic expenditure requires verified Premium access.','El gasto dinámico requiere acceso Premium verificado.'],
 paused:['Observation is paused. Your saved targets stay separate.','La observación está pausada. Tus metas guardadas se mantienen por separado.'],
 collecting:['Collecting recent food and weight records. No estimate is ready yet.','Recopilando registros recientes de comida y peso. Aún no hay una estimación disponible.'],
 stale:['Recent records are needed before showing an updated estimate.','Hacen falta registros recientes para mostrar una estimación actualizada.'],
 estimated:['Low-confidence observational estimate; food logging unverified. Not an intake target.','Estimación observacional de baja confianza; registro alimentario no verificado. No es una meta de ingesta.']};
 return (copy[status]??copy.unavailable)[es?1:0];
}
/** Generic copy only; delivery, scheduling and availability must be authorized by the server. */
export function privateTdeeNotificationCopy(es:boolean){return es?{title:'MacroGoal',body:'Tienes una actualización para revisar en la aplicación.'}:{title:'MacroGoal',body:'You have an update to review in the app.'};}
