/** No generative fallback for food options whose evidence pipeline produced no answer. */
export function foodEvidenceQuestion(text: string, language: string): string | null {
  const s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Only a complete personal-summary command is exempt. A substring such as
  // 'for my macros' must not authorize generated food nutrition.
  const personal = /^(?:(?:please )?(?:show|find|review|check|display)(?: me)? |(?:dame|muestra|revisa|consulta) )?(?:my (?:progress|targets?|goals?|macros|logs|(?:protein|calorie|calories|carbs|fat|fiber) targets?)|mi (?:progreso|resumen)|mis (?:objetivos|macros|registros))[.!?]?$/;
  if (personal.test(s.trim())) return null;
  const meal = /\b(what should i eat|what (?:can|could) i (?:eat|cook)|meal (?:plan|idea|recommendation)s?|suggest (?:a |some )?(?:meal|lunch|dinner|breakfast)|que (?:debo|puedo) (?:comer|cocinar)|plan de comidas|give me the numbers for (?:that|it)|(?:and |what about )?(?:its|their) macros)\b/.test(s);
  const recipe = /\b(recipes?|recetas?|cook at home|cocinar en casa)\b/.test(s);
  const product = /\b(barcode|codigo de barras|supermarket|supermercado|nutrition facts|etiqueta nutricional|product nutrition|nutricion del producto)\b/.test(s);
  const nutrient = '(?:calories?|calorias?|kcal|kilocalories?|kilocalorias?|protein|proteina|carbohydrates?|carbs?|carbohidratos?|fat|grasa|fiber|fibra|macros?|nutrition|nutricion|sugar|azucar|sodium|sodio)';
  const composition = new RegExp('\\b(?:how much|how many|cuanta|cuanto|cuantos|cuantas)\\s+'+nutrient+'\\b[^.!?\\n]{0,100}\\b(?:in|of|from|does|do|contain|contains|has|have|en|de|del|tiene|contiene)\\b', 'i').test(s)
    || new RegExp('\\b(?:is|are|does|do|es|son|tiene|contiene)\\b[^.!?\\n]{0,80}\\b(?:high|low|rich|good source|alto|alta|bajo|baja|rico|rica|fuente)\\b[^.!?\\n]{0,50}\\b'+nutrient+'\\b', 'i').test(s)
    || new RegExp('\\b(?:high|low|rich|good source|alto|alta|bajo|baja|rico|rica|fuente)[- ]'+nutrient+'\\b', 'i').test(s)
    || new RegExp('\\b(?:calories? in|calorias? de|macros? (?:of|in|de)|nutrition (?:facts|content)|nutricion (?:de|del)|etiqueta nutricional)\\b', 'i').test(s);
  const food = /\b(craving|antojo|restaurant menu|menu de restaurante)\b/.test(s) || composition;
  if (!recipe && !product && !food && !meal) return null;
  const es = language.startsWith('es');
  return recipe
    ? es ? '¿Qué receta quieres preparar? Comparte sus ingredientes con cantidades, preparación y número de porciones.' : 'Which recipe would you like to prepare? Share its ingredients with amounts, preparation and number of servings.'
    : product
    ? es ? '¿Qué marca, variante y tamaño de porción quieres consultar?' : 'Which brand, variant and serving size would you like to check?'
    : es ? '¿Qué plato, restaurante y porción quieres consultar?' : 'Which dish, restaurant and serving would you like to check?';
}

/** Rejects model-authored food quantities; only structured evidence routes may supply nutrition. */
export function generatedFoodEvidenceQuestion(raw: string, visible: string, language: string, requestText = ''): string | null {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const text = normalize(visible), all = normalize(raw);
  const foodAction = /["']action_type["']\s*:\s*["'](?:add_food_to_diary|create_meal_plan)["']/.test(all);
  const requestedEvidence = requestText ? foodEvidenceQuestion(requestText, language) : null;
  const energyUnits = '(?:kcal|kilocalories?|kilocalorias?|calories?|calorias?|kj|kilojoules?|kilojulios?|mj|megajoules?|megajulios?|kilokalorien?)';
  const numeral = '(?:\\d+(?:[.,]\\d+)?|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|zero|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix|cent|mille|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|ciento|mil)(?:[- ](?:hundred|thousand|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|quatre-vingt|quarante|cuarenta))?';
  const energyAmount = new RegExp('\\b' + numeral + '\\s*' + energyUnits + '\\b', 'i');
  const servingEnergy = new RegExp('\\b(?:serving|portion|porci[oó]n|raci[oó]n)\\b[^.!?\\n]{0,100}\\b' + numeral + '\\s*' + energyUnits + '\\b', 'i');
  const nutrientAmount = /\b(?:protein|proteina|carbs?|carbohydrates?|carbohidratos?|fat|grasa|fiber|fibra|sodium|sodio|sugar|azucar)\b[^.!?\n]{0,35}\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|ten|twenty|hundred|uno|una|dos|tres|cuatro|cinco|diez|cien|ciento)\s*(?:g(?:rams?|ramos?)?|mg|milligrams?|miligramos?)\b/i;
  const reverseNutrientAmount = /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|ten|twenty|hundred|uno|una|dos|tres|cuatro|cinco|diez|cien|ciento)\s*(?:g(?:rams?|ramos?)?|mg|milligrams?|miligramos?)\s*(?:of\s+|de\s+)?(?:protein|proteina|carbs?|carbohydrates?|carbohidratos?|fat|grasa|fiber|fibra|sodium|sodio|sugar|azucar)\b/i;
  // Narrow personal record sentences remain available. Appended food claims do
  // not become safe merely because another sentence mentions a goal or log.
  const personal = /^(?:your|my|tu|tus|mi|mis|today's|today you|hoy)\s+(?:(?:daily|recorded|logged|actual|diario|registrado)\s+)*(?:(?:protein|calorie|calories|carbs|fat|fiber|proteina|calorias|grasa|fibra)\s+)?(?:target|goal|intake|total|objetivo|meta|consumo|registro|logged|recorded)\s+(?:(?:is|was|are|were|es|son|fue|de|of|for today|para hoy)\s+)?(?:[:=]\s*)?\d+(?:[.,]\d+)?\s*(?:kcal|calories|calorias|g|grams|gramos)(?:\s+(?:of |de )?(?:protein|proteina|carbs|fat|grasa|fiber|fibra))?$/;
  const qualitativeFoodClaim=(value:string)=>/\b(?:high|low|rich|lean|good source|packed with|contains?|provides?|alto|alta|bajo|baja|rico|rica|fuente de)\b[^.!?\n]{0,90}\b(?:protein|proteina|calories?|calorias?|carbs?|carbohydrates?|carbohidratos?|fat|grasa|fiber|fibra|sugar|azucar|sodium|sodio)\b/i.test(value)
    || /\b(?:protein|proteina|calories?|calorias?|carbs?|carbohydrates?|carbohidratos?|fat|grasa|fiber|fibra|sugar|azucar|sodium|sodio)\b[^.!?\n]{0,90}\b(?:high|low|rich|lean|good source|packed with|contains?|provides?|alto|alta|bajo|baja|rico|rica|fuente de)\b/i.test(value);
  // Exempt only individual interrogative preference prompts. Composition
  // predicates make the sentence a claim even when it also asks a question.
  const isPreferenceQuestion=(sentence:string)=>{
    const row=sentence.trim().replace(/^[¿¡]+/,'');
    if(!row.endsWith('?')||/\b(?:is|are|has|have|contains?|provides?|offers?|es|esta|son|tiene|contiene|aporta|ofrece)\b/i.test(row))return false;
    const asks=/^(?:do you (?:prefer|want)|what matters most|prefieres|prefiere|que te importa mas|que es mas importante)\b/i.test(row);
    const priorities=/\b(?:high protein|(?:low|lower) calories?|alto en proteina|alta en proteina|bajo en calorias|baja en calorias|menos calorias)\b/i.test(row);
    const alternatives=/\b(?:or|o|balance|both|ambos|ambas)\b/i.test(row);
    return asks&&priorities&&alternatives;
  };
  const qualitativeText=text.split(/(?<=[.!?])\s+|\n/).filter(sentence=>!isPreferenceQuestion(sentence)).join(' ');
  const hasQualitativeFoodClaim=qualitativeFoodClaim(qualitativeText);
  const unsafeNumbers = text.split(/(?<=[.!?])\s+|\n/).some(line =>
    (energyAmount.test(line) || servingEnergy.test(line) || nutrientAmount.test(line) || reverseNutrientAmount.test(line)) &&
    !personal.test(line.replace(/[.!?]$/, '').trim()));
  return requestedEvidence || foodAction || hasQualitativeFoodClaim || unsafeNumbers
    ? (language.startsWith('es') ? '¿Qué alimento y porción quieres consultar? Para una receta, comparte todos los ingredientes, cantidades y porciones.' : 'Which food and serving should I check? For a recipe, share every ingredient, amount and serving count.')
    : null;
}

/** A source-backed candidate identity is useful even when its serving and nutrition are unverified. */
export function unverifiedDiscoveryGuidance(options: unknown, language: string): string | null {
  if (!Array.isArray(options)) return null;
  const labels: string[] = [];
  for (const item of options.slice(0, 3)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 160 || /[\u0000-\u001f\u007f]/.test(row.name)) continue;
    const name = row.name.trim().replace(/\s+/g, ' ');
    const details = ['restaurant_name','brand','variant','retailer','address'].flatMap(key=>{
      const value=row[key];return typeof value==='string'&&value.trim().length<=180&&!/[\u0000-\u001f\u007f]/.test(value)?[value.trim().replace(/\s+/g,' ')]:[];
    });
    const uniqueDetails=[...new Set(details.filter(value=>value.toLocaleLowerCase()!==name.toLocaleLowerCase()))];
    const label = uniqueDetails.length ? `${name} - ${uniqueDetails.join(', ')}` : name;
    if (!labels.some(existing => existing.toLocaleLowerCase() === label.toLocaleLowerCase())) labels.push(label);
  }
  if (!labels.length) return null;
  const joined = labels.join(language.startsWith('es') ? '; ' : '; ');
    const rows=options.filter((item:any)=>item&&typeof item==='object'&&typeof item.name==='string').slice(0,3);
    const recipe=rows.some((item:any)=>item.kind==='recipe');
    const missing=new Set(rows.flatMap((item:any)=>Array.isArray(item.missing_fields)?item.missing_fields:[]));
    const needsServing=missing.has('serving');
    const needsNutrition=['calories','protein','carbs','fats','fiber'].some(x=>missing.has(x));
    if(language.startsWith('es')){
      if(recipe)return `Encontré estas recetas candidatas: ${joined}. La fuente no permitió confirmar una opción verificable para guardar; no estimaré macros. Elige una receta para comprobar su página o pide otras opciones.`;
      const missingText=[needsServing?'el tamaño de porción':'',needsNutrition?'la nutrición completa':''].filter(Boolean).join(' y ')||'los detalles necesarios';
      return `Encontré estos candidatos: ${joined}. No pude verificar ${missingText}; no estimaré macros ni disponibilidad. Elige uno para comprobar su fuente o pide otras opciones.`;
    }
    if(recipe)return `I found these recipe candidates: ${joined}. The source did not support a verified option to save, so I will not estimate macros. Select a recipe to check its page or ask for alternatives.`;
    const missingText=[needsServing?'the serving size':'',needsNutrition?'complete nutrition':''].filter(Boolean).join(' and ')||'the required details';
    return `I found these candidates: ${joined}. I could not verify ${missingText}; I will not estimate macros or availability. Select one to verify its source or ask for alternatives.`;
}

