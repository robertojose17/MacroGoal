import type {MealConversation} from './coachMealConversation';

// Suggestions are explicit user replies, never inferred location or restrictions.
export function coachMealQuickReplies(value:MealConversation|undefined,es:boolean):string[]{
 if(value?.status!=='clarify')return [];
 if(value.question?.key==='mode')return es?['Quiero cocinar','Quiero comer fuera','Algo rápido sin cocinar']:['I want to cook','I want to eat out','Something quick without cooking'];
 if(value.question?.key==='food_query')return es?['Algo con más proteína','Dame algunas ideas']:['Something with more protein','Give me a few ideas'];
 return []; // Area must come from the person; never fabricate nearby places.
}
