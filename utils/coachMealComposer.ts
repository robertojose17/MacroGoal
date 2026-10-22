export type MealComposer = { placeholder:string; disabled:boolean; submit(text:string):boolean };
export type MealChatTurn = { role:'user'|'assistant'; text:string };
