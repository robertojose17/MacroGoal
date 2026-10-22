export function mealSearchDisclosure(request:Record<string,unknown>,es:boolean):string[] {
 const text=(key:string)=>typeof request[key]==='string'?(request[key] as string).trim():'';
 const rows:string[]=[];const restaurant=text('restaurant'),food=text('food'),area=text('area');
 if(restaurant)rows.push(`${es?'Restaurante':'Restaurant'}: ${restaurant}`);
 if(food)rows.push(`${es?'Buscar':'Look for'}: ${['menu options','opciones del menú'].includes(food)?(es?'opciones del menú':'menu options'):food}`);
 if(area)rows.push(`${es?'Zona':'Area'}: ${area}`);
 const preferences:Record<string,string>=es?{preferred_food:'Lo que te apetece',balanced:'Una opción equilibrada',high_protein:'Más proteína',lower_calorie:'Menos calorías'}:{preferred_food:'What you feel like eating',balanced:'A balanced option',high_protein:'More protein',lower_calorie:'Fewer calories'};
 if(preferences[text('preference')])rows.push(`${es?'Preferencia':'Preference'}: ${preferences[text('preference')]}`);
 if(typeof request.max_minutes==='number')rows.push(`${es?'Tiempo disponible':'Time available'}: ${request.max_minutes} min`);
 return rows;
}
export type MealFailureKind='premium'|'permission'|'limit'|'session'|'unknown';
export function mealFailureKind(reason:string):MealFailureKind {
 const code=reason.toLowerCase();
 if(['premium_required','subscription_unavailable','premium_expired'].includes(code))return 'premium';
 if(['pilot_not_enabled','opt_in_unavailable','existing_search_pilot_required','existing_search_opt_in_required','permission_denied','consent_required'].includes(code))return 'permission';
 if(['budget_limit','budget_exhausted','quota_exceeded','usage_limit','daily_limit','monthly_limit','web_budget_limit'].includes(code))return 'limit';
 if(['scope_changed','unauthorized','session_changed','owner_changed','journal_scope_mismatch','recovery_scope_mismatch'].includes(code))return 'session';
 return 'unknown';
}
export function mealFailureMessage(reason:string,es:boolean):string {
 const say=(en:string,sp:string)=>es?sp:en;
 if(mealFailureKind(reason)==='premium')return say('I could not verify Premium access. Check your subscription and try again.','No pude verificar el acceso Premium. Revisa tu suscripción e inténtalo de nuevo.');
 if(mealFailureKind(reason)==='permission')return say('Web search is not enabled or its permission could not be verified. You can still browse recipes or return to our conversation.','La búsqueda web no está habilitada o no pude verificar su permiso. Puedes explorar recetas o volver a la conversación.');
 if(mealFailureKind(reason)==='limit')return say('Search is paused by a usage or budget limit. No automatic retry will run. You can browse recipes instead.','La búsqueda está pausada por un límite de uso o presupuesto. No se reintentará automáticamente. Puedes explorar recetas.');
 if(mealFailureKind(reason)==='session')return say('Your account or day changed, or your session needs checking. Return to Coach and choose again.','Tu cuenta o día cambió, o hay que verificar tu sesión. Vuelve al Coach y elige de nuevo.');
 return say('I could not complete this search. That does not tell me whether your Premium access is the cause. Your choices are kept.','No pude completar esta búsqueda. Eso no confirma que se deba a tu acceso Premium. Tus opciones se conservan.');
}
