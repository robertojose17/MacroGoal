function buildSystemPrompt(
  userGoals:{daily_calories:number;daily_protein:number;daily_carbs:number;daily_fats:number},
  recipePool:any[],preferences:UserPreferences|null,skinnytasteContent:string
):string{
  const recipeSection=recipePool.length>0?`INSPIRATION RECIPES:
${recipePool.map(r=>`- [${r.meal_type.toUpperCase()}] ${r.name} (${r.cuisine}) ~${r.calories} cal, ${r.protein}g protein, ${r.carbs}g carbs, ${r.fat}g fat`).join("
")}
`:"";