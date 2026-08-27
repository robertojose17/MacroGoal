import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { createClient } from "npm:@supabase/supabase-js@2";

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

async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${url}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();
  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength < 1000) {
    throw new Error(`Downloaded image is too small (${arrayBuffer.byteLength} bytes) — likely a storage error`);
  }
  const base64 = encodeBase64(new Uint8Array(arrayBuffer));
  return `data:${mimeType};base64,${base64}`;
}

async function callVision(
  labelDataUri: string,
  frontDataUri: string,
  knownProductName: string | null
): Promise<string> {
  const prompt = `You are a nutrition data validator.

You have two images:
- Image 1: The nutrition facts label of a food product
- Image 2: The front of the food product packaging

Your job:
1. Read the product name and brand from Image 2 (the front)
2. Read the nutrition values per 100g from Image 1 (the label): calories, protein, carbs, fat, fiber
3. Based on your knowledge of this product type, verify the nutrition values are reasonable and consistent with this type of product
${knownProductName ? `4. Also verify that the product in Image 2 matches the known product name: "${knownProductName}"` : ""}

Return ONLY valid JSON with no markdown fences:
{
  "product_name": "string",
  "brand": "string or null",
  "match": true or false,
  "confidence": "high" or "low" or "unreadable",
  "reject_reason": "string explaining why if match is false, null if match is true",
  "per_100g": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "fiber": number
  }
}

If either image is unreadable or not a food product, return:
{ "confidence": "unreadable", "match": false, "reject_reason": "Could not read one or both photos clearly", "product_name": "", "brand": null, "per_100g": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0 } }`;

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SUPABASE_URL,
      "X-Title": "Macro Goal Nutrition Validator",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: labelDataUri } },
            { type: "image_url", image_url: { url: frontDataUri } },
            { type: "text", text: prompt },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
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

  if (!photo_label_url) return jsonResponse({ status: "error", message: "photo_label_url is required" }, 400);
  if (!photo_front_url) return jsonResponse({ status: "error", message: "photo_front_url is required" }, 400);

  console.log("[VisionNutrition] User:", userId, "type:", type, "barcode:", barcode, "food_item_id:", food_item_id);

  try {
    let knownProductName: string | null = null;
    if (type === "correction") {
      if (food_item_id) {
        const { data: existing } = await supabase.from("food_items").select("name, brand").eq("id", food_item_id).maybeSingle();
        if (existing) knownProductName = [existing.brand, existing.name].filter(Boolean).join(" ");
      } else if (barcode) {
        const { data: existing } = await supabase.from("food_items").select("name, brand").eq("barcode", barcode).maybeSingle();
        if (existing) knownProductName = [existing.brand, existing.name].filter(Boolean).join(" ");
      }
    }

    console.log("[VisionNutrition] Known product name:", knownProductName);

    // Download images and convert to base64 data URIs
    let labelDataUri: string;
    let frontDataUri: string;

    try {
      labelDataUri = await urlToDataUri(photo_label_url);
      console.log("[VisionNutrition] Label image downloaded, size:", labelDataUri.length);
    } catch (e) {
      console.error("[VisionNutrition] Failed to download label photo:", e);
      return jsonResponse({ status: "error", message: "Could not download the label photo. Please try again." });
    }

    try {
      frontDataUri = await urlToDataUri(photo_front_url);
      console.log("[VisionNutrition] Front image downloaded, size:", frontDataUri.length);
    } catch (e) {
      console.error("[VisionNutrition] Failed to download front photo:", e);
      return jsonResponse({ status: "error", message: "Could not download the front photo. Please try again." });
    }

    console.log("[VisionNutrition] Calling OpenRouter model:", VISION_MODEL);

    let aiResult: Record<string, unknown>;
    try {
      const rawText = await callVision(labelDataUri, frontDataUri, knownProductName);
      console.log("[VisionNutrition] AI response:", rawText.slice(0, 800));
      aiResult = extractJSON(rawText) as Record<string, unknown>;
    } catch (e) {
      console.error("[VisionNutrition] AI call failed:", e);
      return jsonResponse({ status: "error", message: "Analysis failed. Please try again." });
    }

    const confidence = aiResult.confidence as string;
    const match = aiResult.match as boolean;

    console.log("[VisionNutrition] confidence:", confidence, "match:", match);

    if (confidence === "unreadable") {
      return jsonResponse({
        status: "error",
        message: "Could not read one or both photos clearly. Please retake them in good lighting.",
      });
    }

    if (!match) {
      const reason = (aiResult.reject_reason as string) || "The photos do not match this product.";
      return jsonResponse({ status: "error", message: `Could not verify: ${reason}` });
    }

    const productName = (aiResult.product_name as string) || "Unknown Product";
    const brand = (aiResult.brand as string | null) || null;
    const p100 = aiResult.per_100g as Record<string, number>;
    const per100g = {
      calories: Number(p100.calories) || 0,
      protein: Number(p100.protein) || 0,
      carbs: Number(p100.carbs) || 0,
      fat: Number(p100.fat) || 0,
      fiber: Number(p100.fiber) || 0,
    };

    let foodItem: Record<string, unknown>;

    if (type === "correction") {
      let updateQuery = supabase.from("food_items").update({
        calories: per100g.calories,
        protein: per100g.protein,
        carbs: per100g.carbs,
        fat: per100g.fat,
        fiber: per100g.fiber,
        ai_verified: true,
        verified: true,
        confidence: "high",
        source: "user_correction",
      });

      if (food_item_id) {
        updateQuery = updateQuery.eq("id", food_item_id);
      } else if (barcode) {
        updateQuery = updateQuery.eq("barcode", barcode);
      } else {
        return jsonResponse({ status: "error", message: "food_item_id or barcode required for correction" }, 400);
      }

      const { data: updated, error: updateError } = await updateQuery.select().single();

      if (updateError || !updated) {
        console.error("[VisionNutrition] Update error:", updateError);
        return jsonResponse({ status: "error", message: "Failed to update food item. Please try again." });
      }

      foodItem = updated;
      console.log("[VisionNutrition] Updated food item:", updated.id);

    } else {
      const insertData: Record<string, unknown> = {
        name: productName,
        brand,
        calories: per100g.calories,
        protein: per100g.protein,
        carbs: per100g.carbs,
        fat: per100g.fat,
        fiber: per100g.fiber,
        serving_size: 100,
        serving_unit: "g",
        macros_per: "100g",
        source: "user",
        verified: true,
        confidence: "high",
        ai_verified: true,
      };
      if (barcode) insertData.barcode = barcode;

      const { data: inserted, error: insertError } = await supabase.from("food_items").insert(insertData).select().single();

      if (insertError) {
        if (insertError.code === "23505" && barcode) {
          const { data: existing } = await supabase.from("food_items").select("*").eq("barcode", barcode).maybeSingle();
          if (existing) return jsonResponse({ status: "approved", food_item: existing });
        }
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
      extracted_data: { per_100g: per100g, product_name: productName, brand },
      type: type === "correction" ? "correction" : "new_product",
      status: "approved",
      ai_confidence: confidence === "high" ? 95 : 70,
      food_item_id: foodItem.id as string,
    }).then(({ error }) => {
      if (error) console.warn("[VisionNutrition] Audit error:", error.message);
    });

    return jsonResponse({ status: "approved", food_item: foodItem });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[VisionNutrition] Unhandled error:", msg);
    return jsonResponse({ status: "error", message: "An unexpected error occurred. Please try again." });
  }
});
