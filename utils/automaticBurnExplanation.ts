import type {ObservationProgram} from './dynamicTdeeObservation';
/** Presentation only: keep the estimator's gates, and never mistake a model hold for a user switch. */
export function automaticBurnExplanation(input:{program:ObservationProgram|null;loading:boolean;error:string|null},es:boolean):string{
 const pick=(en:string,sp:string)=>es?sp:en;
 if(input.loading)return pick('Checking the latest records…','Comprobando los registros recientes…');
 if(input.error||!input.program)return pick('Daily Burn could not be verified. Check your connection and reopen this screen; no estimate has replaced your saved targets.','No se pudo verificar Daily Burn. Revisa la conexión y vuelve a abrir esta pantalla; ninguna estimación ha sustituido tus metas guardadas.');
 const p=input.program;
 if(!p.premium)return pick('Daily Burn requires verified Premium access. Your weight records and saved targets are unchanged.','Daily Burn requiere acceso Premium verificado. Tus registros de peso y metas guardadas no cambian.');
 if(!p.enabled)return pick('Automatic Daily Burn analysis is not available for this account right now. Your saved targets are unchanged.','El análisis automático de Daily Burn no está disponible para esta cuenta en este momento. Tus metas guardadas no cambian.');
 const e=p.estimate;
 if(!e)return pick('An estimate is not ready yet. Daily Burn needs recent food records and distributed weigh-ins across at least 21 days.','Todavía no hay una estimación. Daily Burn necesita registros recientes de comida y pesajes distribuidos durante al menos 21 días.');
 if(e.status==='estimated'&&e.reason==='ready')return pick('Low-confidence estimate from logged food and weight changes. Food logging is not verified complete; this is not a metabolic measurement or an intake target.','Estimación de baja confianza basada en comida registrada y cambios de peso. No se ha verificado que los registros de comida estén completos; no es una medición metabólica ni una meta de ingesta.');
 const reasons:Record<string,[string,string]>={
  insufficient_weights:['More distributed weigh-ins are needed: at least 10 across the review period, without long gaps.','Se necesitan más pesajes distribuidos: al menos 10 durante el período de cálculo, sin intervalos largos.'],
  insufficient_history:['Daily Burn needs at least 21 days between recorded weights. This is a longer window than the 14-day weight trend.','Daily Burn necesita al menos 21 días entre los pesos registrados. Es un período más largo que la tendencia de peso de 14 días.'],
  missing_intake:['Some days in the calculation period have no food record. Missing days are not assumed to have zero calories; keep recording your actual intake.','Hay días sin registros de comida en el período de cálculo. No se supone que esos días tuvieron cero calorías; continúa registrando tu ingesta real.'],
  possible_partial_logging:['Some food records do not meet the data-quality checks for this estimate. Review the recorded meals and amounts; the app will not assume they represent a complete day.','Algunos registros de comida no cumplen los controles de calidad de este cálculo. Revisa las comidas y cantidades registradas; la app no supondrá que representan un día completo.'],
  stale_weight:['A recent weigh-in is needed before showing an updated Daily Burn estimate. Older recorded weights are still kept.','Hace falta un pesaje reciente para mostrar una estimación actualizada de Daily Burn. Los pesos anteriores se conservan.'],
  unstable_weight:['Weight variations do not support a stable Daily Burn estimate yet. Keep recording; this does not establish a plateau.','Las variaciones de peso todavía no permiten una estimación estable de Daily Burn. Continúa registrando; esto no demuestra un estancamiento.'],
  invalid_data:['The food or weight records could not be validated for this calculation. Review their dates, values and units.','No se pudieron validar los registros de comida o peso para este cálculo. Revisa sus fechas, valores y unidades.'],
  implausible_estimate:['The calculated result is outside this model’s supported range, so no Daily Burn number is shown. Your saved targets are unchanged.','El resultado está fuera del rango admitido por este modelo; por eso no se muestra una cifra de Daily Burn. Tus metas guardadas no cambian.'],
  unsupported_age:['A supported profile could not be verified for this Daily Burn calculation. Your saved targets are unchanged.','No se pudo verificar un perfil compatible para este cálculo de Daily Burn. Tus metas guardadas no cambian.'],
  source_error:['The records needed for Daily Burn could not be loaded. Reopen this screen to try reading them again.','No se pudieron cargar los registros necesarios para Daily Burn. Vuelve a abrir esta pantalla para intentar consultarlos otra vez.'],
  unknown_calorie_provenance:['The source of the calorie records could not be verified for this calculation. No expenditure estimate is substituted.','No se pudo verificar el origen de los registros de calorías para este cálculo. No se sustituye por una estimación de gasto.'],
 };
 if(Object.prototype.hasOwnProperty.call(reasons,e.reason))return reasons[e.reason][es?1:0];
 if(e.status==='stale')return reasons.stale_weight[es?1:0];
 return pick('The available records do not yet support a verified Daily Burn estimate. No automatic target change was made.','Los registros disponibles todavía no permiten una estimación verificada de Daily Burn. No se hizo ningún cambio automático de metas.');
}
