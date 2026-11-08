import { createOffMass } from '../_shared/offMass.mjs';
import {captureSelectedNutrition,readProviderJSON,refreshCachedSelection} from '../_shared/nutritionRefresh.mjs';
import { decorateCachedProducts } from '../_shared/portionCache.mjs';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { barcodeCandidates } from './identity.mjs';
import {handleSelectedNutrition} from '../_shared/selectedNutritionEndpoint.ts';
import {scheduleCachedNutrition,scheduleFetchedNutrition} from '../_shared/selectedNutritionHooks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanityCheck(
  nutriments: Record<string, number>,
  _serving_quantity: unknown
): { passes: boolean; reason: string } {
  const core=['energy-kcal_100g','proteins_100g','carbohydrates_100g','fat_100g'];
  if(core.some((key,index)=>typeof nutriments[key]!=='number'||!Number.isFinite(nutriments[key])||nutriments[key]<0||nutriments[key]>(index===0?1000:100)))return {passes:false,reason:'missing_or_invalid_core_nutrition'};
  if(nutriments.fiber_100g!=null&&(typeof nutriments.fiber_100g!=='number'||!Number.isFinite(nutriments.fiber_100g)||nutriments.fiber_100g<0||nutriments.fiber_100g>100))return {passes:false,reason:'invalid_optional_nutrition'};
  const cal=nutriments['energy-kcal_100g'],protein=nutriments.proteins_100g,
    carbs=nutriments.carbohydrates_100g,fat=nutriments.fat_100g,fiber=nutriments.fiber_100g??0;

  const macroDensity = protein + carbs + fat + fiber;
  if (macroDensity < 15) {
    return {
      passes: false,
      reason: `macro_density_too_low: ${macroDensity}g per 100g`,
    };
  }

  if (cal < 50 && cal > 0) {
    return {
      passes: false,
      reason: `calorie_density_too_low: ${cal} kcal per 100g`,
    };
  }

  const expectedCal = protein * 4 + carbs * 4 + fat * 9;
  if (expectedCal > 0 && cal > 0) {
    const ratio = cal / expectedCal;
    if (ratio < 0.5 || ratio > 2.0) {
      return {
        passes: false,
        reason: `calorie_macro_mismatch: declared=${cal}, expected=${expectedCal}, ratio=${ratio.toFixed(2)}`,
      };
    }
  }

  return { passes: true, reason: 'ok' };
}

async function verifyWithAIVision(
  _barcode: string,
  offProduct: Record<string, unknown>,
  openrouterKey: string
): Promise<Record<string, number | null> | null> {
  const selectedImages = offProduct.selected_images as
    | Record<string, unknown>
    | undefined;
  const nutritionImageUrl =
    (selectedImages?.nutrition as Record<string, Record<string, string>>)
      ?.display?.en ??
    (selectedImages?.nutrition as Record<string, Record<string, string>>)
      ?.display?.es ??
    (selectedImages?.nutrition as Record<string, Record<string, string>>)
      ?.display?.fr ??
    null;

  if (!nutritionImageUrl) return null;

  const prompt = `You are reading a nutrition facts label from a food product image.
Extract the nutrition values carefully. The label shows values PER SERVING and/or PER 100g.
Return ONLY a JSON object with these exact keys (use null if not visible):
{
  "serving_size_g": number,
  "calories_per_serving": number,
  "protein_per_serving_g": number,
  "carbs_per_serving_g": number,
  "fat_per_serving_g": number,
  "fiber_per_serving_g": number,
  "calories_per_100g": number,
  "protein_per_100g": number,
  "carbs_per_100g": number,
  "fat_per_100g": number,
  "fiber_per_100g": number
}
Return ONLY the JSON, no explanation, no markdown.`;

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://macro-goal.app',
        'X-Title': 'Macro Goal',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: nutritionImageUrl } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 300,
      }),
    }
  );

  if (!response.ok) return null;
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return null;

  try {
    const clean = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// One legacy model read is a review candidate, never shared-catalog authority.
export function normalizeLegacyScanRead(value:any){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const valid=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const fields=['calories','protein','carbs','fat','fiber'];
 const per100=['calories_per_100g','protein_per_100g','carbs_per_100g','fat_per_100g','fiber_per_100g'];
 const serving=['calories_per_serving','protein_per_serving_g','carbs_per_serving_g','fat_per_serving_g','fiber_per_serving_g'];
 const grams=valid(value.serving_size_g)&&value.serving_size_g>0?value.serving_size_g:null;
 const full100=per100.slice(0,4).every(k=>valid(value[k]));
 const fullServing=grams!==null&&serving.slice(0,4).every(k=>valid(value[k]));
 if(!full100&&!fullServing)return null;
 const keys=full100?per100:serving,other=full100?serving:per100,factor=full100?1:100/grams;
 const otherFactor=full100?(grams===null?null:100/grams):1;
 const nutrition:Record<string,number|null>={};
 for(let i=0;i<fields.length;i++){
  const n=valid(value[keys[i]])?value[keys[i]]*factor:null;
  if(n!==null&&(!valid(n)||n>(i===0?1000:100)))return null;
  if(n!==null&&otherFactor!==null&&valid(value[other[i]])&&Math.abs(n-value[other[i]]*otherFactor)>0.1)return null;
  nutrition[fields[i]]=n;
 }
 return {nutrition,servingGrams:grams??100,basis:full100?'100g':'serving'};
}

function mapOffProductToItem(
  offProduct: Record<string, unknown>,
  aiResult: Record<string, number | null> | null,
  aiVerified: boolean,
  dataQualityWarning: boolean,
  sanityFailReason?: string
) {
  const nutriments = (offProduct.nutriments ?? {}) as Record<string, number>;
  let servingQty =
    typeof offProduct.serving_quantity === 'number'
      ? offProduct.serving_quantity
      : parseFloat(String(offProduct.serving_quantity ?? '0')) || 0;

  // Only normalized provider fields carry a proven per100 basis. Bare fields
  // cannot fill an absent normalized value; unknown optional values stay null.
  const providerValue=(key:string)=>typeof nutriments[key]==='number'&&Number.isFinite(nutriments[key])&&nutriments[key]>=0?nutriments[key]:null;
  let cal100=providerValue('energy-kcal_100g');
  let protein100=providerValue('proteins_100g');
  let carbs100=providerValue('carbohydrates_100g');
  let fat100=providerValue('fat_100g');
  let fiber100=providerValue('fiber_100g');

  if (aiResult) {
    const read=normalizeLegacyScanRead(aiResult);
    cal100=read?.nutrition.calories??null;protein100=read?.nutrition.protein??null;
    carbs100=read?.nutrition.carbs??null;fat100=read?.nutrition.fat??null;fiber100=read?.nutrition.fiber??null;
    servingQty=read?.servingGrams??100;
  }

  const item: Record<string, unknown> = {
    name: (offProduct.product_name as string) || (offProduct.generic_name as string) || '',
    brand: (offProduct.brands as string) || '',
    barcode: (offProduct.code as string) || '',
    calories: cal100 === null ? null : Math.round(cal100 * 10) / 10,
    protein: protein100 === null ? null : Math.round(protein100 * 10) / 10,
    carbs: carbs100 === null ? null : Math.round(carbs100 * 10) / 10,
    fat: fat100 === null ? null : Math.round(fat100 * 10) / 10,
    fiber: fiber100 === null ? null : Math.round(fiber100 * 10) / 10,
    serving_size: servingQty,
    serving_quantity: servingQty,
    macros_per: '100g' as const,
    ai_verified: aiVerified,
  };

  if (dataQualityWarning) item._data_quality_warning = true;
  if (sanityFailReason) item._sanity_fail_reason = sanityFailReason;

  return item;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let selectedOperation=false;
  try{selectedOperation=(await req.clone().json())?.operation==='capture_selected_nutrition_v1';}catch{}
  if(selectedOperation){
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    return await handleSelectedNutrition(req,admin,corsHeaders);
  }

  // Only the explicit operation enters this terminal authenticated branch.
  let portionOperation=false;
  try {portionOperation=['usda_portions_v1','usda_portions_cached_v1'].includes((await req.clone().json())?.operation);}
  catch {/* Preserve the original barcode JSON validation below. */}
  if(portionOperation){
    try{
      const {handlePortionRequest}=await import('../_shared/portionEndpoint.ts');
      const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      return await handlePortionRequest(req,admin,corsHeaders);
    }catch{return jsonResponse({error:'Portion verification unavailable'},503);}
  }

  let barcode: string;
  let reviewCapable=false;
  try {
    const body = await req.json();
    barcode = body?.barcode;
    reviewCapable=body?.review_capability==='label_confirmation_v1';
    if (!barcode || typeof barcode !== 'string') {
      return jsonResponse({ error: 'barcode is required' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const reviewResponse=(payload:Record<string,unknown>)=>reviewCapable?jsonResponse(payload):jsonResponse({found:false,
    status:'update_required',error:'LOOKUP_REVIEW_UPDATE_REQUIRED',
    message:'Update MacroGoal to review this food safely. No food was added.'},409);

  // Include validated UPC/EAN aliases, including UPCs beginning with zero.
  const barcodesToTry = barcodeCandidates(barcode);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Step 1: Check food_items table
  const { data: dbRows, error: dbError } = await supabase
    .from('food_items')
    .select('*')
    .in('barcode', barcodesToTry)
    .limit(3);

  if (dbError) return jsonResponse({found:false,error:'catalog_lookup_unavailable'},503);
  const cachedRows=[...new Map<unknown,Record<string,unknown>>((dbRows??[]).map((row:Record<string,unknown>):[unknown,Record<string,unknown>]=>[row.id,row])).values()];
  if(cachedRows.length>1)return reviewResponse({found:true,item:{barcode,name:'',ai_verified:false,
    requires_label_confirmation:true},source:'supabase_ambiguous',persisted:false,
    requires_label_confirmation:true,capture_status:'ambiguous_existing'});
  const dbRow=cachedRows[0]??null;

  // If found in DB, return immediately
  if (dbRow) {
    scheduleCachedNutrition(supabase,req,String(dbRow.id));
    await refreshCachedSelection(supabase,req,{foodId:dbRow.id,provider:dbRow.usda_fdc_id?'usda':'openfoodfacts',sourceId:String(dbRow.usda_fdc_id||dbRow.barcode)});
    const decorated=await decorateCachedProducts([{_usda_fdc_id:dbRow.usda_fdc_id,product_name:dbRow.name,nutriments:{}}],supabase,150);
    return jsonResponse({ found: true, item: {...dbRow,_portion_evidence:decorated[0]?._portion_evidence??null}, source: 'supabase' });
  }

  // Store supabase item for fallback
  const supabaseItem = dbRow ?? null;

  if(!reviewCapable&&Deno.env.get('OFF_MASS_CAPTURE_ENABLED')!=='true')return reviewResponse({});

  // Step 2: Call OpenFoodFacts
  let offProduct: Record<string, unknown> | null = null;
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,nutriscore_grade,unique_scans_n,selected_images,ingredients_text,preparation,serving_quantity_unit,nutrition_data_per,nutrition_data_prepared_per,nutrition`;
    const offRes = await fetch(offUrl, {
      headers: { 'User-Agent': 'MacroGoal/1.0 (macro-goal.app)' },
    });
    if (offRes.ok) {
      const offData = (Deno.env.get('NUTRIENT_REFRESH_ENABLED')==='true'||Deno.env.get('OFF_MASS_CAPTURE_ENABLED')==='true')?await readProviderJSON(offRes):await offRes.json();
      if (offData.status === 1 && offData.product) {
        offProduct = offData.product as Record<string, unknown>;
      }
    }
  } catch (e) {
    console.error('OFacts fetch error:', e);
  }

  // No OFacts result — return supabase item or not found
  if (!offProduct) {
    if (supabaseItem) {
      return jsonResponse({ found: true, item: supabaseItem, source: 'supabase_unverified' });
    }
    return jsonResponse({ found: false });
  }

  // Identity must match before provider or model data is considered.
  if(!barcodeCandidates(String(offProduct.code??'')).some((code:string)=>barcodesToTry.includes(code))) return jsonResponse({found:false,error:'provider_identity_mismatch'},503);

  // The filtered OFF response is persisted as partial source evidence only.
  scheduleFetchedNutrition(supabase,req,'openfoodfacts',String(offProduct.code),offProduct,null,'search_response');

  // New-food-only known-mass path. No legacy insert or model fallback after this gate.
  { // Safety is unconditional; the write switch never enables a legacy insert.
    const mass=await createOffMass({admin:supabase,request:req,product:offProduct,
      expectedId:barcode,requestId:crypto.randomUUID(),enabled:Deno.env.get('OFF_MASS_CAPTURE_ENABLED')==='true'});
    if((mass.status==='created'||mass.status==='existing')&&mass.food_item?.id){
      return jsonResponse({found:true,item:mass.food_item,source:mass.status==='created'?'openfoodfacts':'supabase',persisted:true});
    }
    // Unsupported units, ambiguous identity, rejected proof and uncertain writes all
    // use explicit label confirmation. Never invent a normalized food from them.
    return reviewResponse({found:true,item:{name:typeof offProduct.product_name==='string'?offProduct.product_name:'',
      brand:typeof offProduct.brands==='string'?offProduct.brands:'',barcode:String(offProduct.code??barcode),
      ai_verified:false,requires_label_confirmation:true},source:'openfoodfacts_unverified',
      persisted:false,requires_label_confirmation:true,capture_status:mass.status});
  }

});

