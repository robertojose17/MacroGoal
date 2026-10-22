// Bounded bilingual vocabulary. Unknown free text must be clarified, never
// treated as an ingredient that was successfully excluded.
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const groups=[
 ['chicken','pollo'],['beef','res','carne de res'],['pork','cerdo'],['turkey','pavo'],
 ['tuna','atun'],['salmon'],['shrimp','camarones','camaron','gambas'],
 ['milk','leche'],['cheese','queso','feta','parmesan','parmesano','monterey jack'],
 ['egg','eggs','huevo','huevos'],['peanut','peanuts','mani','cacahuate','cacahuates'],
 ['almond','almonds','almendra','almendras'],['soy','soya','soja'],['wheat','trigo'],
 ['rice','arroz'],['corn','maiz'],['bean','beans','frijol','frijoles','habichuelas'],
 ['chickpea','chickpeas','garbanzo','garbanzos'],['onion','onions','cebolla','cebollas'],
 ['garlic','ajo'],['tomato','tomatoes','tomate','tomates'],['mushroom','mushrooms','hongo','hongos','champinon','champinones'],
 ['broccoli','brocoli'],['cucumber','pepino'],['avocado','aguacate'],['lettuce','lechuga']
];
export function exclusionTerms(terms:string[]){
 const unsupported=terms.filter(t=>!groups.some(g=>g.includes(normalize(t))));
 return {unsupported,groups:terms.map(t=>groups.find(g=>g.includes(normalize(t)))).filter((g):g is string[]=>!!g)};
}
export function containsExcludedIngredient(ingredients:string[],terms:string[]){
 const parsed=exclusionTerms(terms);if(parsed.unsupported.length)return true;
 return ingredients.some(i=>parsed.groups.some(group=>group.some(alias=>(' '+normalize(i)+' ').includes(' '+alias+' '))));
}
