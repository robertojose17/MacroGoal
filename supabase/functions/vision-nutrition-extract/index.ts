import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { canonicalBarcode, handleVerifiedCorrection, legacyPer100gResponseItem, resolveCorrectionIdentity, validateVerifiedLabel } from "./identity.mjs";
import { runTwoReadGate, readableLabelEvidence } from "./nutritionReadGate.mjs";
import { handleRecovery } from "./recovery.ts";
import { recoveryImageDataUri } from "./recovery-images.ts";
import { createReceiptFetch, persistRecoveryReceipt } from "./recovery-receipts.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const VISION_MODEL = "google/gemini-2.5-flash";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function urlToDataUri(url: string, label: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch ${label}: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 1000) {
    throw new Error(`${label} image is too small to read`);
  }
  const contentType = res.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';
  // Chunked btoa to avoid stack overflow on large images
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return `data:${contentType};base64,${base64}`;
}

async function callVision(
  labelDataUri: string,
  frontDataUri: string,
  knownProductName: string | null,
  signal?: AbortSignal,
  bounded = false,
  providerFetch:typeof fetch = fetch
): Promise<{ text: string; finishReason: string | null }> {
  const prompt = `You are a careful nutrition-label transcription system.

You have two images:
- Image 1: the nutrition facts label
- Image 2: the front of the package

Read the product name and brand from Image 2. Check whether the package in Image 2 matches the known product, if one is provided.
Transcribe only exact printed values from one clearly identified per-serving column in Image 1, or the printed per-100-g column if no per-serving column exists. Never infer, estimate, convert, use package net weight, borrow values from product knowledge, or fill a missing or illegible value. Represent a visible printed zero as 0; use null when unreadable or absent. The selected header and basis must agree; never call a per-100-g column per-serving. Read total carbohydrate, total fat, protein, calories and dietary fiber only, not sugars, saturated fat, or trans fat. Do not convert qualified values such as less than 1 g, <1 g, or trace into exact numbers.
Record every detected nutrition column and its exact header. Select the per-serving column, and for every nutrient record its row label, selected column header, unit and exact row text as evidence. Record the literal serving description, serving-size evidence, and serving size in grams.
Set readability to clear only if the label is legible. Set ambiguous true when the serving column or any nutrient row cannot be selected unambiguously.
${knownProductName ? `Known product name for the front-photo match check: "${knownProductName}"` : ""}

Return ONLY valid JSON, without markdown:
{
  "product_name": "string",
  "brand": "string or null",
  "match": true or false,
  "confidence": "high" or "low" or "unreadable",
  "reject_reason": "string or null",
  "readability": "clear" or "unclear",
  "ambiguous": true or false,
  "selected_column_header": "exact header string or null",
    "selected_basis": "per_serving" or "per_100g" or "other",
  "detected_columns": ["each exact nutrition column header"],
  "serving_size_g": number or null,
  "serving_quantity": "literal serving description exactly as printed, including preparation wording, or null",
  "serving_size_evidence": "exact label text showing the serving size in grams, or null",
  "nutrients": {
    "calories": { "value": number or null, "unit": "kcal or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" },
    "protein": { "value": number or null, "unit": "g or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" },
    "carbs": { "value": number or null, "unit": "g or null", "row_label": "exact total carbohydrate label or null", "column_header": "exact selected header or null", "printed_text": "short literal row evidence including row label and amount or null" },
    "fat": { "value": number or null, "unit": "g or null", "row_label": "exact total fat label or null", "column_header": "exact selected header or null", "printed_text": "short literal row evidence including row label and amount or null" },
    "fiber": { "value": number or null, "unit": "g or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" }
  }
}

If either image or any required label field is unclear, return the same schema with readability "unclear", ambiguous true, and null for each field you cannot read.`;
  return await requestVision("primary_two_image_read", [
    { type: "image_url", image_url: { url: labelDataUri } },
    { type: "image_url", image_url: { url: frontDataUri } },
    { type: "text", text: prompt },
  ], signal, bounded, providerFetch);
}

async function callIndependentLabelRead(labelDataUri: string, signal?: AbortSignal, bounded=false, providerFetch:typeof fetch=fetch): Promise<{ text: string; finishReason: string | null }> {
  const prompt = `Independently transcribe the nutrition facts label in the single supplied image. This is a fresh reading: do not assume or reuse any previous result, expected values, product database values, or outside product knowledge. Do not infer, estimate, convert, or fill anything not legible and printed. Use null for absent or illegible values; a printed zero is 0. Detect all column headers, select the clearly labeled per-serving column, or the printed per-100-g column if no per-serving column exists, and ensure the selected basis agrees with its exact header. Read total carbohydrate, total fat, protein, calories and dietary fiber only, not sugars, saturated fat, or trans fat. Do not turn qualified values such as less than 1 g, <1 g, or trace into exact numbers. For serving size and each selected nutrient, return the exact header and basis, serving size, row label, unit, numeric value, and a short literal evidence snippet including that row label and its amount. Preserve the literal serving description, including cooking/preparation words.

Return ONLY valid JSON, without markdown:
{
  "readability": "clear" or "unclear",
  "ambiguous": true or false,
  "selected_column_header": "exact header string or null",
  "selected_basis": "per_serving" or "per_100g" or "other",
  "detected_columns": ["each exact nutrition column header"],
  "serving_size_g": number or null,
  "serving_quantity": "literal serving description or null",
  "serving_size_evidence": "exact label text showing serving size grams or null",
  "nutrients": {
    "calories": { "value": number or null, "unit": "kcal or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" },
    "protein": { "value": number or null, "unit": "g or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" },
    "carbs": { "value": number or null, "unit": "g or null", "row_label": "exact total carbohydrate label or null", "column_header": "exact selected header or null", "printed_text": "short literal row evidence including row label and amount or null" },
    "fat": { "value": number or null, "unit": "g or null", "row_label": "exact total fat label or null", "column_header": "exact selected header or null", "printed_text": "short literal row evidence including row label and amount or null" },
    "fiber": { "value": number or null, "unit": "g or null", "row_label": "exact label or null", "column_header": "exact selected header or null", "printed_text": "exact row text or null" }
  }
}`;
  return await requestVision("independent_label_only_read", [
    { type: "image_url", image_url: { url: labelDataUri } },
    { type: "text", text: prompt },
  ], signal, bounded, providerFetch);
}

async function requestVision(stage: string, content: unknown[], signal?: AbortSignal, bounded=false, providerFetch:typeof fetch=fetch): Promise<{ text: string; finishReason: string | null }> {
  const res = await providerFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SUPABASE_URL,
      "X-Title": "Macro Goal Nutrition Validator",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{ role: "user", content }],
      temperature: 0.1,
      max_tokens: 1536,
      ...(bounded ? {provider:{allow_fallbacks:false,require_parameters:true,max_price:{prompt:2.5,completion:15}}} : {}),
    }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`OpenRouter request failed with status ${res.status}`);
  const data = await res.json();
  const choice = data.choices?.[0];
  const usage = data.usage ?? {};
  console.log("[VisionNutrition] model_usage", {
    model: VISION_MODEL,
    stage,
    prompt_tokens: Number.isFinite(usage.prompt_tokens) ? usage.prompt_tokens : null,
    completion_tokens: Number.isFinite(usage.completion_tokens) ? usage.completion_tokens : null,
    total_tokens: Number.isFinite(usage.total_tokens) ? usage.total_tokens : null,
  });
  return {
    text: typeof choice?.message?.content === "string" ? choice.message.content : "",
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
  };
}
function extractJSON(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found in response");
  return JSON.parse(jsonStr.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ status: "error", message: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth) return jsonResponse({ status: "error", message: "Unauthorized" }, 401);

  const token = auth.replace("Bearer ", "");
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData?.user) return jsonResponse({ status: "error", message: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let body: {
    action?: string;
    [key: string]: any;
    barcode?: string;
    photo_label_url?: string;
    photo_front_url?: string;
    type?: string;
    food_item_id?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "error", message: "Invalid JSON body" }, 400);
  }

  const { barcode, photo_label_url, photo_front_url, type, food_item_id } = body;

  if (body.action?.startsWith('recovery_')) {
    if (body.action === 'recovery_capabilities') return jsonResponse({recovery_enabled:Deno.env.get('BARCODE_RECOVERY_ENABLED') === 'true'});
    if (!['recovery_discover', 'recovery_photos', 'recovery_confirm'].includes(body.action)) return jsonResponse({status:'error',code:'invalid_action'},400);
    try {
      const recoveryDeadline=Date.now()+125000;
      const result = await handleRecovery(body, {
        supabase, userId, secret:SERVICE_ROLE, apiKey:OPENROUTER_API_KEY, projectUrl:SUPABASE_URL,
        enabled:Deno.env.get('BARCODE_RECOVERY_ENABLED') === 'true',deadline:recoveryDeadline,
        receiptFetch:(submission,revision)=>createReceiptFetch({fetcher:fetch,submission,revision,deadline:recoveryDeadline,
          persist:(receipt:any)=>persistRecoveryReceipt(supabase,userId,submission,receipt)}),
        readPhotos:async (label, front, known, providerFetch=fetch) => {
          const labelData = await recoveryImageDataUri(label,fetch,recoveryDeadline);
          const frontData = await recoveryImageDataUri(front,fetch,recoveryDeadline);
          if(Date.now()>=recoveryDeadline)throw Error('request_deadline');
          let identity: {name?:string;brand?:string} = {};
          let partialEvidence: unknown = null;
          const result = await runTwoReadGate(async signal => {
            const response=await callVision(labelData,frontData,known,signal,true,providerFetch);
            const parsed=extractJSON(response.text) as any;
            identity={name:parsed?.product_name,brand:parsed?.brand};
            partialEvidence=readableLabelEvidence(parsed);
            return {result:parsed,finishReason:response.finishReason};
          },async signal => {
            const response=await callIndependentLabelRead(labelData,signal,true,providerFetch);
            return {result:extractJSON(response.text),finishReason:response.finishReason};
          },{timeoutMs:Math.max(1,Math.min(30000,recoveryDeadline-Date.now()))});
          return {...result,identity,partialEvidence};
        },
      });
      return jsonResponse(result);
    } catch (error) {
      const codes=['invalid_proposal','expired_proposal','confirmation_required','identity_or_nutrition_unverified','save_conflict','invalid_photo'];
      const code=error instanceof Error&&codes.includes(error.message)?error.message:'recovery_unavailable';
      console.warn('[VisionNutrition] recovery_failure', {code});
      return jsonResponse({status:'error',code},code==='save_conflict'?409:400);
    }
  }

  if (!photo_label_url) return jsonResponse({ status: "error", message: "photo_label_url is required" }, 400);
  if (!photo_front_url) return jsonResponse({ status: "error", message: "photo_front_url is required" }, 400);

  let correctionIdentity: { row: Record<string, unknown> | null; barcode: string | null; isNew: boolean } | null = null;
  if (type === "correction") {
    try {
      correctionIdentity = await resolveCorrectionIdentity({ food_item_id, barcode }, {
        async findById(id: string) {
          const { data, error } = await supabase.from("food_items").select("*").eq("id", id).maybeSingle();
          if (error) throw error;
          return data;
        },
        async findByBarcodes(codes: string[]) {
          const { data, error } = await supabase.from("food_items").select("*").in("barcode", codes);
          if (error) throw error;
          return data ?? [];
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not resolve food item";
      return jsonResponse({ status: "error", message });
    }
  }

  console.log("[VisionNutrition] User:", userId, "type:", type, "barcode:", barcode, "food_item_id:", food_item_id);

  try {
    const existing = correctionIdentity?.row;
    const knownProductName = existing ? [existing.brand, existing.name].filter(Boolean).join(" ") : null;

    // Download images and convert to base64 data URIs
    let labelDataUri: string;
    let frontDataUri: string;

    try {
      labelDataUri = await urlToDataUri(photo_label_url, 'label');
    } catch {
      console.warn("[VisionNutrition] Label image fetch failed");
      return jsonResponse({ status: "error", message: "Could not read the label photo. Please retake it clearly." });
    }

    try {
      frontDataUri = await urlToDataUri(photo_front_url, 'front');
    } catch {
      console.warn("[VisionNutrition] Front image fetch failed");
      return jsonResponse({ status: "error", message: "Could not read the front photo. Please retake it clearly." });
    }

    const gate = await runTwoReadGate(
      async (signal) => {
        const response = await callVision(labelDataUri, frontDataUri, knownProductName, signal);
        return { result: extractJSON(response.text), finishReason: response.finishReason };
      },
      async (signal) => {
        const response = await callIndependentLabelRead(labelDataUri, signal);
        return { result: extractJSON(response.text), finishReason: response.finishReason };
      },
    );
    const verificationUsage = { model: VISION_MODEL, model_calls: gate.calls };
    if (!gate.ok) return jsonResponse({ status: "error", message: gate.message, verification_usage: verificationUsage });

    // Only validated primary-read values are persisted; the second read is an independent gate.
    const aiResult: Record<string, unknown> = {
      product_name: gate.productName,
      brand: gate.brand,
      match: true,
      confidence: "high",
      reject_reason: null,
      serving_size_g: gate.servingSize,
      serving_quantity: gate.servingQuantity,
      per_serving: gate.nutrition,
    };
    const checked = validateVerifiedLabel(aiResult);
    if (!checked.ok) return jsonResponse({ status: "error", message: checked.message, verification_usage: verificationUsage });
    const confidence = "high";
    const productName = checked.productName;
    const brand = checked.brand;
    const servingSize = checked.servingSize;
    const servingQuantity = checked.servingQuantity;
    const nutrition = checked.nutrition;
    let foodItem: Record<string, unknown>;

    if (type === "correction") {
      const identity = correctionIdentity!;
      const outcome = await handleVerifiedCorrection(aiResult, identity, {
          async update(id: string, values: Record<string, unknown>) {
            const { data, error } = await supabase.from("food_items").update(values).eq("id", id).select().maybeSingle();
            if (error) throw error;
            return data;
          },
          async insert(values: Record<string, unknown>) {
            const { data, error } = await supabase.from("food_items").insert(values).select().single();
            if (error) throw error;
            return data;
          },
          async findByBarcodes(codes: string[]) {
            const { data, error } = await supabase.from("food_items").select("*").in("barcode", codes);
            if (error) throw error;
            return data ?? [];
          },
        });
      if (outcome.status !== "approved" || !outcome.food_item) return jsonResponse(outcome);
      foodItem = outcome.food_item;

    } else {
      const insertData: Record<string, unknown> = {
        name: productName,
        brand,
        calories: nutrition.calories,
        protein: nutrition.protein,
        carbs: nutrition.carbs,
        fat: nutrition.fat,
        fiber: nutrition.fiber,
        serving_size: servingSize,
        serving_quantity: servingQuantity,
        serving_unit: "g",
        macros_per: "serving",
        source: "user",
        verified: true,
        confidence: "high",
        ai_verified: true,
      };
      if (barcode) insertData.barcode = canonicalBarcode(barcode);

      const { data: inserted, error: insertError } = await supabase.from("food_items").insert(insertData).select().single();

      if (insertError) {
        if (insertError.code === "23505" && barcode) return jsonResponse({ status: "error", message: "A food item with this barcode already exists. Please look it up and try again." });
        console.error("[VisionNutrition] Insert error:", insertError);
        return jsonResponse({ status: "error", message: "Failed to save food item. Please try again." });
      }

      foodItem = inserted;
      console.log("[VisionNutrition] Inserted food item:", inserted.id);
    }

    supabase.from("food_submissions").insert({
      barcode: barcode || "",
      submitted_by_user_id: userId,
      photo_label_url,
      photo_front_url,
      extracted_data: { per_serving: nutrition, serving_size_g: servingSize, serving_quantity: servingQuantity, product_name: productName, brand },
      type: type === "correction" ? "correction" : "new_product",
      status: "approved",
      ai_confidence: confidence === "high" ? 95 : 70,
      food_item_id: foodItem.id as string,
    }).then(({ error }) => {
      if (error) console.warn("[VisionNutrition] Audit error:", error.message);
    });

    const responseFoodItem = type === "new_product" ? legacyPer100gResponseItem(foodItem) : foodItem;
    return jsonResponse({ status: "approved", food_item: responseFoodItem, verification_usage: verificationUsage });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[VisionNutrition] Unhandled error:", msg);
    return jsonResponse({ status: "error", message: "An unexpected error occurred. Please try again." });
  }
});

