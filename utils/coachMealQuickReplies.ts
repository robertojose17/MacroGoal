import type {MealConversation} from './coachMealConversation';

// Suggestions are explicit user replies, never inferred location or restrictions.
export function coachMealQuickReplies(value:MealConversation|undefined,es:boolean):string[]{
 if(value?.status!=='clarify')return [];
 return coachMealQuestionQuickReplies(value.question?.key,es);
}

// Offer only genuine bounded choices; location, restaurant and portion stay free text.
export function coachMealQuestionQuickReplies(question:string|undefined,es:boolean):string[]{
 if(question==='mode')return es?['Quiero cocinar','Quiero comer fuera','Algo rápido sin cocinar']:['I want to cook','I want to eat out','Something quick without cooking'];
 if(question==='food_query')return es?['Algo con más proteína','Dame algunas ideas']:['Something with more protein','Give me a few ideas'];
 if(question==='public_area')return es?['Prefiero cocinar','Algo rápido en casa']:['I would rather cook','Something quick at home'];
 return []; // A public area must come from the person; never fabricate a city.
}
