import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { barcodeCandidates, canonicalNewBarcode, insertLookupItemOrReturnWinner } from './identity.mjs';

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
  const cal =
    nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0;
  const protein =
    nutriments['proteins_100g'] ?? nutriments['proteins'] ?? 0;
  const carbs =
    nutriments['carbohydrates_100g'] ?? nutriments['carbohydrates'] ?? 0;
  const fat = nutriments['fat_100g'] ?? nutriments['fat'] ?? 0;
  const fiber = nutriments['fiber_100g'] ?? nutriments['fiber'] ?? 0;

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

function mapOffProductToItem(
  offProduct: Record<string, unknown>,
  aiResult: Record<string, number | null> | null,
  aiVerified: boolean,
  dataQualityWarning: boolean,
  sanityFailReason?: string
) {
  const nutriments = (offProduct.nutriments ?? {}) as Record<string, number>;
  const servingQty =
    typeof offProduct.serving_quantity === 'number'
      ? offProduct.serving_quantity
      : parseFloat(String(offProduct.serving_quantity ?? '0')) || 0;

  let cal100 =
    nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal'] ?? 0;
  let protein100 = nutriments['proteins_100g'] ?? nutriments['proteins'] ?? 0;
  let carbs100 =
    nutriments['carbohydrates_100g'] ?? nutriments['carbohydrates'] ?? 0;
  let fat100 = nutriments['fat_100g'] ?? nutriments['fat'] ?? 0;
  let fiber100 = nutriments['fiber_100g'] ?? nutriments['fiber'] ?? 0;

  if (aiResult) {
    if (aiResult.calories_per_100g != null) {
      cal100 = aiResult.calories_per_100g;
    } else if (
      aiResult.calories_per_serving != null &&
      aiResult.serving_size_g != null &&
      aiResult.serving_size_g > 0
    ) {
      cal100 = Math.round(
        (aiResult.calories_per_serving / aiResult.serving_size_g) * 100
      );
    }
    if (aiResult.protein_per_100g != null) protein100 = aiResult.protein_per_100g;
    else if (aiResult.protein_per_serving_g != null && aiResult.serving_size_g)
      protein100 = Math.round((aiResult.protein_per_serving_g / aiResult.serving_size_g) * 100);

    if (aiResult.carbs_per_100g != null) carbs100 = aiResult.carbs_per_100g;
    else if (aiResult.carbs_per_serving_g != null && aiResult.serving_size_g)
      carbs100 = Math.round((aiResult.carbs_per_serving_g / aiResult.serving_size_g) * 100);

    if (aiResult.fat_per_100g != null) fat100 = aiResult.fat_per_100g;
    else if (aiResult.fat_per_serving_g != null && aiResult.serving_size_g)
      fat100 = Math.round((aiResult.fat_per_serving_g / aiResult.serving_size_g) * 100);

    if (aiResult.fiber_per_100g != null) fiber100 = aiResult.fiber_per_100g;
    else if (aiResult.fiber_per_serving_g != null && aiResult.serving_size_g)
      fiber100 = Math.round((aiResult.fiber_per_serving_g / aiResult.serving_size_g) * 100);
  }

  const item: Record<string, unknown> = {
    name: (offProduct.product_name as string) || (offProduct.generic_name as string) || '',
    brand: (offProduct.brands as string) || '',
    barcode: (offProduct.code as string) || '',
    calories: Math.round(cal100 * 10) / 10,
    protein: Math.round(protein100 * 10) / 10,
    carbs: Math.round(carbs100 * 10) / 10,
    fat: Math.round(fat100 * 10) / 10,
    fiber: Math.round(fiber100 * 10) / 10,
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

  let barcode: string;
  try {
    const body = await req.json();
    barcode = body?.barcode;
    if (!barcode || typeof barcode !== 'string') {
      return jsonResponse({ error: 'barcode is required' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Include validated UPC/EAN aliases, including UPCs beginning with zero.
  const barcodesToTry = barcodeCandidates(barcode);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY') ?? '';

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Step 1: Check food_items table
  const { data: dbRow, error: dbError } = await supabase
    .from('food_items')
    .select('*')
    .in('barcode', barcodesToTry)
    .maybeSingle();

  if (dbError) {
    console.error('DB lookup error:', dbError);
  }

  // If found in DB, return immediately
  if (dbRow) {
    return jsonResponse({ found: true, item: dbRow, source: 'supabase' });
  }

  // Store supabase item for fallback
  const supabaseItem = dbRow ?? null;

  // Step 2: Call OpenFoodFacts
  let offProduct: Record<string, unknown> | null = null;
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments,nutriscore_grade,unique_scans_n,selected_images`;
    const offRes = await fetch(offUrl, {
      headers: { 'User-Agent': 'MacroGoal/1.0 (macro-goal.app)' },
    });
    if (offRes.ok) {
      const offData = await offRes.json();
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

  // Step 3: Sanity check
  const nutriments = (offProduct.nutriments ?? {}) as Record<string, number>;
  const check = sanityCheck(nutriments, offProduct.serving_quantity);

  if (check.passes) {
    const item = mapOffProductToItem(offProduct, null, false, false);
    return jsonResponse({ found: true, item, source: 'openfoodfacts' });
  }

  // Step 4: Sanity failed — try AI Vision
  if (!openrouterKey) {
    const item = mapOffProductToItem(offProduct, null, false, true, check.reason);
    return jsonResponse({ found: true, item, source: 'openfoodfacts_unverified' });
  }

  const aiResult = await verifyWithAIVision(barcode, offProduct, openrouterKey);

  if (!aiResult) {
    const item = mapOffProductToItem(offProduct, null, false, true, check.reason);
    if (supabaseItem) {
      return jsonResponse({ found: true, item: supabaseItem, source: 'supabase_unverified', _data_quality_warning: true });
    }
    return jsonResponse({ found: true, item, source: 'openfoodfacts_unverified' });
  }

  // AI Vision succeeded — build corrected item
  const correctedItem = mapOffProductToItem(offProduct, aiResult, true, false);

  // Save to food_items with ai_verified = true
  try {
    const upsertData = {
      name: correctedItem.name as string,
      brand: correctedItem.brand as string,
      barcode: canonicalNewBarcode(correctedItem.barcode as string),
      calories: correctedItem.calories as number,
      protein: correctedItem.protein as number,
      carbs: correctedItem.carbs as number,
      fat: correctedItem.fat as number,
      fiber: correctedItem.fiber as number,
      serving_size: correctedItem.serving_size as number,
      serving_quantity: String(correctedItem.serving_quantity),
      macros_per: '100g',
      ai_verified: true,
      ai_verified_at: new Date().toISOString(),
      ai_verified_source: 'gpt4o_vision',
      source: 'openfoodfacts',
      updated_at: new Date().toISOString(),
    };

    const persisted = await insertLookupItemOrReturnWinner(upsertData, {
      async insert(values: Record<string, unknown>) {
        const { data, error } = await supabase.from('food_items').insert(values).select('*').single();
        if (error) throw error;
        return data;
      },
      async findByBarcodes(codes: string[]) {
        const { data, error } = await supabase.from('food_items').select('*').in('barcode', codes);
        if (error) throw error;
        return data ?? [];
      },
    });
    return jsonResponse({ found: true, item: persisted.item, source: persisted.inserted ? 'ai_verified' : 'supabase' });
  } catch (e) {
    console.error('Insert or conflict recovery error:', e);
    return jsonResponse({ found: false, error: 'verified_item_persistence_failed' }, 503);
  }
});
