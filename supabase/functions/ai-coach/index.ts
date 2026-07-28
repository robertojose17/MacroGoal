
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function genUUID(): string {
  return crypto.randomUUID();
}

/** Extract ACTION_PROPOSAL JSON from the AI response text */
function extractActionProposal(text: string): Record<string, unknown> | null {
  const match = text.match(/ACTION_PROPOSAL:\s*(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    const raw = match[1];
    // Find the balanced closing brace
    let depth = 0;
    let end = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    return JSON.parse(raw.slice(0, end));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  console.log("[AICoach] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("[AICoach] 📥 New request:", requestId);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENROUTER_API_KEY) {
      console.error("[AICoach] ❌ OPENROUTER_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Configuration Error", detail: "OPENROUTER_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = auth.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error("[AICoach] ❌ Auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized", detail: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUser = userData.user;
    console.log("[AICoach] ✅ User authenticated:", authUser.id);

    // ── Subscription check ────────────────────────────────────────────────────
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (subError) {
      console.warn("[AICoach] ⚠️ Subscription check error:", subError.message);
    } else if (!subscription || (subscription.status !== "active" && subscription.status !== "trialing")) {
      console.error("[AICoach] ❌ No active subscription for user:", authUser.id);
      return new Response(JSON.stringify({
        error: "Subscription Required",
        detail: "An active subscription is required to use the AI Coach.",
        subscription_status: subscription?.status || "none",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[AICoach] ✅ Subscription verified:", subscription?.status);

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: {
      messages?: { role: string; content: string; timestamp?: number }[];
      user_id?: string;
      weight_unit?: string;
      stream?: boolean;
      conversation_id?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = body.messages || [];
    const weightUnit = body.weight_unit || "lb";
    const conversationId = body.conversation_id || null;

    console.log("[AICoach] Messages:", messages.length, "| weight_unit:", weightUnit, "| conversation_id:", conversationId);

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch user context data ───────────────────────────────────────────────
    const userId = authUser.id;
    const today = new Date().toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [
      profileResult,
      goalsResult,
      nutritionResult,
      weightResult,
      stepsResult,
      memoryResult,
    ] = await Promise.all([
      supabase.from("users").select("*").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("*").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase
        .from("daily_logs")
        .select("date, calories, protein, carbs, fats, fiber")
        .eq("user_id", userId)
        .gte("date", fourteenDaysAgo)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(14),
      supabase
        .from("weight_logs")
        .select("date, weight")
        .eq("user_id", userId)
        .gte("date", fourteenDaysAgo)
        .order("date", { ascending: false })
        .limit(14),
      supabase
        .from("trackers")
        .select("name, value, date")
        .eq("user_id", userId)
        .eq("name", "steps")
        .gte("date", fourteenDaysAgo)
        .order("date", { ascending: false })
        .limit(7),
      supabase
        .from("coach_memory")
        .select("key, value, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(20),
    ]);

    const profile = profileResult.data;
    const goals = Array.isArray(goalsResult.data) ? goalsResult.data[0] ?? null : goalsResult.data;
    const nutritionLogs = nutritionResult.data || [];
    const weightLogs = weightResult.data || [];
    const stepsLogs = stepsResult.data || [];
    const memoryItems = memoryResult.data || [];

    console.log("[AICoach] Context fetched — profile:", !!profile, "| goals:", !!goals, "| nutrition days:", nutritionLogs.length, "| weight entries:", weightLogs.length);

    // ── Build system prompt ───────────────────────────────────────────────────
    const wUnit = weightUnit === "kg" ? "kg" : "lb";

    // USER PROFILE block
    const profileBlock = profile
      ? `USER PROFILE:
- Name: ${profile.full_name || profile.username || "User"}
- Age: ${profile.age || "unknown"}
- Height: ${profile.height_cm ? `${profile.height_cm} cm` : "unknown"}
- Current weight: ${profile.current_weight ? `${profile.current_weight} ${wUnit}` : "unknown"}
- Goal weight: ${profile.goal_weight ? `${profile.goal_weight} ${wUnit}` : "unknown"}
- Activity level: ${profile.activity_level || "unknown"}
- Gender: ${profile.gender || "unknown"}`
      : "USER PROFILE: Not available";

    // RECENT NUTRITION block
    let nutritionBlock = "RECENT NUTRITION (last 14 days):\n";
    if (nutritionLogs.length > 0) {
      for (const log of nutritionLogs) {
        nutritionBlock += `- ${log.date}: ${log.calories ?? 0} cal | P: ${log.protein ?? 0}g | C: ${log.carbs ?? 0}g | F: ${log.fats ?? 0}g | Fiber: ${log.fiber ?? 0}g\n`;
      }
    } else {
      nutritionBlock += "- No nutrition data available\n";
    }

    // GOALS block
    const goalsBlock = goals
      ? `CURRENT DAILY TARGETS (always use these exact numbers for meal plans and goal suggestions):
- Daily calories: ${goals.daily_calories ?? "not set"} kcal
- Protein: ${goals.protein_g ?? "not set"}g
- Carbs: ${goals.carbs_g ?? "not set"}g
- Fats: ${goals.fats_g ?? "not set"}g
- Fiber: ${goals.fiber_g ?? "not set"}g
- Goal type: ${goals.goal_type || "not set"}
- Macro preset: ${goals.macro_preset || "not set"}`
      : "CURRENT DAILY TARGETS: Not set";

    // WEIGHT TREND block
    let weightBlock = "WEIGHT TREND (last 14 days):\n";
    if (weightLogs.length > 0) {
      for (const w of weightLogs) {
        weightBlock += `- ${w.date}: ${w.weight} ${wUnit}\n`;
      }
    } else {
      weightBlock += "- No weight data available\n";
    }

    // STEPS block
    let stepsBlock = "STEPS (last 7 days):\n";
    if (stepsLogs.length > 0) {
      for (const s of stepsLogs) {
        stepsBlock += `- ${s.date}: ${s.value ?? 0} steps\n`;
      }
    } else {
      stepsBlock += "- No steps data available\n";
    }

    // COACH MEMORY block
    let memoryBlock = "COACH MEMORY:\n";
    if (memoryItems.length > 0) {
      for (const m of memoryItems) {
        memoryBlock += `- ${m.key}: ${m.value}\n`;
      }
    } else {
      memoryBlock += "- No memory entries yet\n";
    }

    const systemPrompt = `You are an expert AI nutrition and fitness coach inside the Macro Goal app. You have full access to the user's data and act as a proactive, data-driven coach.

${profileBlock}

${goalsBlock}

${nutritionBlock}
${weightBlock}
${stepsBlock}
${memoryBlock}

Today's date: ${today}

INSTRUCTIONS:
- Answer directly and concisely. Use the user's actual data. No motivational speeches.
- Keep responses under 6 short lines unless detail is explicitly requested.
- CRITICAL: When the user asks for a meal plan (any variation: "create a meal plan", "make me a meal plan", "give me a meal plan", "plan my meals", "weekly meal plan", etc.), you MUST NEVER write the meal plan as text in the chat. Instead, write only a 1-2 sentence summary (e.g. "Here's a 7-day plan hitting your 1765 cal / 196g protein targets. Confirm to save it to your Planning section.") and then append the ACTION_PROPOSAL JSON. The full meal plan data goes ONLY inside the ACTION_PROPOSAL JSON, never as readable text in the message.
- CRITICAL: When proposing a goal change, write only 1-2 sentences explaining the change, then append ACTION_PROPOSAL JSON. Never write out the full goal details as text.
- CRITICAL: When adding food to diary, write only 1 sentence confirming what will be added, then append ACTION_PROPOSAL JSON.
- If the user asks "why?", "explain", "how did you determine that?", or "show me the data", then provide a complete evidence-based explanation.
- If multiple recommendations exist, rank the top 3 only.
- End with "Want to know why I recommend this?" only if you believe an explanation would be useful but the user didn't ask.
- When proposing a goal change, end your response with: ACTION_PROPOSAL: {"action_type":"update_goal","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_value":...,"proposed_value":...,"expected_effect":"..."}}
- When creating a meal plan, end with: ACTION_PROPOSAL: {"action_type":"create_meal_plan","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"plan_name":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","reason":"...","days":[{"date":"YYYY-MM-DD","meals":[{"meal_type":"breakfast","food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"fiber":0,"grams":0,"quantity":1,"serving_unit":"serving","dish_description":"..."}]}]}}
- When adding food to diary, end with: ACTION_PROPOSAL: {"action_type":"add_food_to_diary","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"date":"YYYY-MM-DD","meal_type":"lunch","quantity":1,"serving_unit":"serving"}}`;

    // ── Build OpenRouter messages ──────────────────────────────────────────────
    const apiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    console.log("[AICoach] Calling OpenRouter, model:", DEFAULT_MODEL, "| total messages:", apiMessages.length);

    // ── Stream SSE response ───────────────────────────────────────────────────
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const sendEvent = async (data: Record<string, unknown>) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    };

    // Start streaming in background
    (async () => {
      try {
        const chatRes = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": SUPABASE_URL,
            "X-Title": "Macro Goal AI Coach",
          },
          body: JSON.stringify({
            model: DEFAULT_MODEL,
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 2000,
            stream: true,
          }),
        });

        if (!chatRes.ok) {
          const errText = await chatRes.text();
          console.error("[AICoach] ❌ OpenRouter error:", chatRes.status, errText.slice(0, 200));
          await sendEvent({ error: `OpenRouter error ${chatRes.status}: ${errText.slice(0, 100)}` });
          await writer.close();
          return;
        }

        const reader = chatRes.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const delta = chunk.choices?.[0]?.delta?.content || "";
              if (delta) {
                fullText += delta;
                await sendEvent({ delta });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }

        console.log("[AICoach] ✅ Stream complete, full_text length:", fullText.length);

        // Parse ACTION_PROPOSAL from the full response
        const actionProposalRaw = extractActionProposal(fullText);
        let actionProposal: Record<string, unknown> | null = null;

        if (actionProposalRaw) {
          // Ensure action_id and confirmation_token are set
          const proposal = actionProposalRaw as Record<string, unknown>;
          const action_id = (proposal.action_id as string) || genUUID();
          const confirmation_token = (proposal.confirmation_token as string) || genUUID();
          const innerProposal = (proposal.proposal as Record<string, unknown>) || {};

          // Merge action_type into proposal if not already there
          if (!innerProposal.action_type && proposal.action_type) {
            innerProposal.action_type = proposal.action_type;
          }

          actionProposal = {
            action_id,
            confirmation_token,
            proposal: innerProposal,
          };

          console.log("[AICoach] Action proposal extracted, action_type:", innerProposal.action_type, "| action_id:", action_id);
        }

        // Save messages to conversation if conversation_id provided
        if (conversationId) {
          try {
            const lastUserMsg = messages[messages.length - 1];
            if (lastUserMsg?.role === "user") {
              await supabase.from("coach_messages").insert({
                conversation_id: conversationId,
                role: "user",
                content: lastUserMsg.content,
              });
            }
            await supabase.from("coach_messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: fullText,
            });
            // Update conversation last_message_at
            await supabase
              .from("coach_conversations")
              .update({ last_message_at: new Date().toISOString() })
              .eq("id", conversationId);
          } catch (saveErr: unknown) {
            const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
            console.warn("[AICoach] Failed to save messages to conversation:", msg);
          }
        }

        await sendEvent({
          done: true,
          full_text: fullText,
          ...(actionProposal ? { action_proposal: actionProposal } : {}),
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[AICoach] ❌ Streaming error:", msg);
        await sendEvent({ error: msg });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[AICoach] ❌ Unhandled error:", msg);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: msg, request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
