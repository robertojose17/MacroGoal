// Parse one literal gram mass, never a numeric substring or inferred conversion.
// Shared by structured Product.nutrition and the opt-in semantic table parser.
export function literalServingGrams(serving) {
  if(typeof serving!=='string'||!serving.trim())return null;
  if(/[<>≤≥~≈−–]|[-+]\s*\d|\d[eE][+-]?\d|(?:^|[^\d])[.,]\d|\b(?:or|to|about|approx(?:imately)?|less|more|greater|under|over|at\s+least|at\s+most|up\s+to)\b/i.test(serving))return null;
  const matches=[...serving.matchAll(/(?:^|[\s(])(\d+(?:[.,]\d+)?)\s*g\b/gi)];
  const allMasses=[...serving.matchAll(/\d\s*g\b/gi)];
  if(matches.length!==1||allMasses.length!==1)return null;
  const grams=Number(matches[0][1].replace(',','.'));
  return Number.isFinite(grams)&&grams>0?grams:null;
}
