import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

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

function extractActionProposal(text: string): Record<string, unknown> | null {
  const match = text.match(/ACTION_PROPOSAL:\s*(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    const raw = match[1];
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
  console.log("[AICoach] New request:", requestId);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENROUTER_API_KEY) {
      console.error("[AICoach] OPENROUTER_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Configuration Error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUser = userData.user;
    console.log("[AICoach] User authenticated:", authUser.id);

    let body: {
      messages?: { role: string; content: string; timestamp?: number }[];
      user_id?: string;
      weight_unit?: string;
      conversation_id?: string;
      is_first_message?: boolean;
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

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // __FIRST_INTERACTION__ is a system-triggered welcome sentinel — bypass subscription gate entirely
    const lastMessageContent = messages[messages.length - 1]?.content;
    const isFirstInteraction = body.is_first_message === true || lastMessageContent === "__FIRST_INTERACTION__";

    // Subscription gating is handled by the frontend (coach.tsx) — backend only verifies auth.

    const userId = authUser.id;
    const today = new Date().toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [
      profileResult,
      goalsResult,
      mealsResult,
      checkInsResult,
      memoryResult,
    ] = await Promise.all([
      supabase.from("users").select("name, username, sex, date_of_birth, height, current_weight, goal_weight, activity_level, weight_unit").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("daily_calories, protein_g, carbs_g, fats_g, fiber_g, goal_type, macro_preset").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("meals").select("date, meal_items(calories, protein, carbs, fats, fiber)").eq("user_id", userId).gte("date", fourteenDaysAgo).lte("date", today).order("date", { ascending: false }),
      supabase.from("check_ins").select("date, weight").eq("user_id", userId).gte("date", fourteenDaysAgo).order("date", { ascending: false }).limit(14),
      supabase.from("coach_memory").select("key, value").eq("user_id", userId).order("updated_at", { ascending: false }).limit(20),
    ]);

    const profile = profileResult.data;
    const goals = Array.isArray(goalsResult.data) ? goalsResult.data[0] ?? null : goalsResult.data;
    const mealsRaw = mealsResult.data || [];
    const checkIns = checkInsResult.data || [];
    const memoryItems = memoryResult.data || [];

    // Aggregate nutrition by date
    const nutritionByDate: Record<string, { calories: number; protein: number; carbs: number; fats: number; fiber: number }> = {};
    for (const meal of mealsRaw) {
      const date = meal.date as string;
      if (!nutritionByDate[date]) nutritionByDate[date] = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
      const items = (meal.meal_items as any[]) || [];
      for (const item of items) {
        nutritionByDate[date].calories += Number(item.calories) || 0;
        nutritionByDate[date].protein += Number(item.protein) || 0;
        nutritionByDate[date].carbs += Number(item.carbs) || 0;
        nutritionByDate[date].fats += Number(item.fats) || 0;
        nutritionByDate[date].fiber += Number(item.fiber) || 0;
      }
    }
    const nutritionLogs = Object.entries(nutritionByDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([date, n]) => ({ date, ...n }));

    console.log("[AICoach] Context — profile:", !!profile, "goals:", !!goals, "nutrition days:", nutritionLogs.length, "weight:", checkIns.length);

    const dbWeightUnit = (profile as any)?.weight_unit || weightUnit || "lb";
    const wUnit = dbWeightUnit === "kg" ? "kg" : "lb";
    const toDisplayWeight = (kg: number): number =>
      wUnit === "lb" ? Math.round(kg * 2.20462 * 100) / 100 : Math.round(kg * 100) / 100;

    let age = "unknown";
    if (profile?.date_of_birth) {
      const dob = new Date(profile.date_of_birth as string);
      age = String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
    }

    const profileBlock = profile
      ? `USER PROFILE:
- Name: ${(profile as any).name || (profile as any).username || "User"}
- Age: ${age}
- Height: ${(profile as any).height ? `${(profile as any).height} cm` : "unknown"}
- Sex: ${(profile as any).sex || "unknown"}
- Current weight: ${(profile as any).current_weight ? `${toDisplayWeight((profile as any).current_weight)} ${wUnit}` : "unknown"}
- Goal weight: ${(profile as any).goal_weight ? `${toDisplayWeight((profile as any).goal_weight)} ${wUnit}` : "unknown"}
- Activity level: ${(profile as any).activity_level || "unknown"}`
      : "USER PROFILE: Not available";

    let nutritionBlock = "RECENT NUTRITION (last 14 days):\n";
    if (nutritionLogs.length > 0) {
      for (const log of nutritionLogs) {
        nutritionBlock += `- ${log.date}: ${Math.round(log.calories)} cal | P: ${Math.round(log.protein)}g | C: ${Math.round(log.carbs)}g | F: ${Math.round(log.fats)}g\n`;
      }
    } else {
      nutritionBlock += "- No nutrition data logged yet\n";
    }

    const goalsBlock = goals
      ? `CURRENT DAILY TARGETS:
- Daily calories: ${(goals as any).daily_calories ?? "not set"} kcal
- Protein: ${(goals as any).protein_g ?? "not set"}g
- Carbs: ${(goals as any).carbs_g ?? "not set"}g
- Fats: ${(goals as any).fats_g ?? "not set"}g
- Goal type: ${(goals as any).goal_type || "not set"}`
      : "CURRENT DAILY TARGETS: Not set";

    let weightBlock = "WEIGHT TREND:\n";
    if (checkIns.length > 0) {
      for (const w of checkIns) {
        weightBlock += `- ${(w as any).date}: ${toDisplayWeight((w as any).weight)} ${wUnit}\n`;
      }
    } else {
      weightBlock += "- No weight data\n";
    }

    let memoryBlock = "COACH MEMORY:\n";
    if (memoryItems.length > 0) {
      for (const m of memoryItems) {
        memoryBlock += `- ${(m as any).key}: ${(m as any).value}\n`;
      }
    } else {
      memoryBlock += "- No memory yet\n";
    }

    // Derive onboarding state from coach_memory for use in the system prompt
    const memoryMap: Record<string, string> = {};
    for (const m of memoryItems) {
      memoryMap[(m as any).key] = (m as any).value;
    }
    const hasExperience = !!memoryMap["onboarding_experience"];
    const hasChallenge = !!memoryMap["onboarding_challenge"];

    const systemPrompt = `You are an expert AI nutrition and fitness coach inside the Macro Goal app.

FORMATTING RULES (non-negotiable):
- Never use dashes, bullet points, asterisks, bold markers (**), or any markdown formatting
- Write in plain natural prose, like a real person texting
- No lists, no headers, no em-dashes, no hyphens used as list markers
- Short paragraphs separated by line breaks only

${profileBlock}

${goalsBlock}

${nutritionBlock}
${weightBlock}
${memoryBlock}

Today: ${today}

CONVERSATION PROGRESSION RULES:
- Messages 1-3: Ask questions to understand the user's lifestyle, schedule, cooking habits, and constraints. One question per message.
- Message 4+: Only after understanding their lifestyle, offer to build a meal plan or give specific recommendations
- Never offer a meal plan before message 4
- Never assume the user's schedule, work type, or weekly routine — always ask first

NATURAL ONBOARDING RULES (replace the old modal — learn through conversation):
- You no longer receive pre-filled onboarding answers. Learn about the user naturally through conversation.
- The COACH MEMORY section above shows what you already know. Check it before asking anything.
- If "onboarding_experience" is not in memory, you need to learn the user's experience level. If "onboarding_challenge" is not in memory, you need to learn their biggest challenge.
- Never ask two onboarding questions at once. Never say "Step 1 of 3" or anything form-like. Just conversation.
- When the user's answer reveals their experience level, use the save_memory tool to store: key="onboarding_experience", value one of: "beginner" / "intermediate" / "advanced"
- When the user's answer reveals their biggest challenge, use save_memory: key="onboarding_challenge", value one of: "cravings" / "not_seeing_results" / "inconsistency" / "dont_know_what_to_eat"
- When the user's answer reveals whether they want a meal plan, use save_memory: key="onboarding_meal_plan", value one of: "yes" / "no"
- After saving, adapt your tone and advice from that point forward based on what you learned.

TONE BY EXPERIENCE LEVEL (apply once onboarding_experience is known):
- beginner: explain terms, be encouraging, never assume knowledge, celebrate small wins
- intermediate: direct, use numbers, light explanation only when needed
- advanced: technical, straight to the point, no hand-holding, assume full macro literacy

When you receive [FIRST_INTERACTION_TRIGGER], write a welcome message that:
- Starts with a warm, brief self-introduction: who you are and what you do (1-2 sentences max)
- Acknowledges their specific goal (use their actual goal from the profile context)
- ${!hasExperience ? 'Ends with ONE natural question about their experience level — e.g. "Before I put together anything for you — have you tracked macros before, or is this new territory for you?"' : !hasChallenge ? 'Ends with ONE natural question about their biggest challenge right now' : 'Goes straight to value — you already know their experience and challenge, so give a useful first insight or ask about their lifestyle'}
- Total length: 3-4 sentences maximum
- No dashes, no bullets, no markdown, no lists
- Do NOT mention macros, calories, or targets in the welcome
- Do NOT offer a meal plan, strategy, or any deliverable in the welcome
- Sound like a real coach introducing themselves, not a software product
- Example tone: "Hi, I'm your nutrition and body transformation coach. I can see you're working toward [their goal] and I'm here to help you get there with a plan built around your actual life. Before I put anything together — have you tracked macros before, or is this new territory for you?"

In subsequent messages, if onboarding_experience or onboarding_challenge are not yet in memory, weave in ONE question naturally when the moment is right. Never interrupt a direct question the user asked just to collect onboarding data — answer them first, then ask.

INSTRUCTIONS:
- Answer directly and concisely. Use the user's actual data.
- Keep responses under 6 short lines unless detail is explicitly requested.
- CRITICAL: When the user asks for a meal plan, write only a 1-2 sentence summary then append ACTION_PROPOSAL JSON. Never write the full plan as text.
- CRITICAL: When proposing a goal change, write only 1-2 sentences then append ACTION_PROPOSAL JSON.
- CRITICAL: When adding food to diary, write only 1 sentence then append ACTION_PROPOSAL JSON.
- When proposing a goal change: ACTION_PROPOSAL: {"action_type":"update_goal","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_value":...,"proposed_value":...,"expected_effect":"..."}}
- When creating a meal plan: ACTION_PROPOSAL: {"action_type":"create_meal_plan","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"plan_name":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","reason":"...","days":[{"date":"YYYY-MM-DD","meals":[{"meal_type":"breakfast","food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"fiber":0,"grams":0,"quantity":1,"serving_unit":"serving","dish_description":"..."}]}]}}
- When adding food to diary: ACTION_PROPOSAL: {"action_type":"add_food_to_diary","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"date":"YYYY-MM-DD","meal_type":"lunch","quantity":1,"serving_unit":"serving"}}`;

    // Gemini doesn't support system role
    const apiMessages: { role: string; content: string }[] = [
      { role: "user", content: `[SYSTEM INSTRUCTIONS]\n${systemPrompt}` },
      { role: "assistant", content: "Understood. I have your full profile, goals, and nutrition history. How can I help?" },
      ...messages.map((m) => ({
        role: m.role,
        // Map the frontend sentinel to the trigger token the prompt expects
        content: m.content === "__FIRST_INTERACTION__" ? "[FIRST_INTERACTION_TRIGGER]" : m.content,
      })),
    ];

    console.log("[AICoach] Calling OpenRouter streaming, model:", DEFAULT_MODEL, "messages:", apiMessages.length);

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
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error("[AICoach] OpenRouter error:", chatRes.status, errText.slice(0, 500));
      return new Response(JSON.stringify({ error: `OpenRouter error ${chatRes.status}`, detail: errText.slice(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream tokens to client as SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const reader = chatRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed === "data: [DONE]") continue;
              if (!trimmed.startsWith("data: ")) continue;
              try {
                const json = JSON.parse(trimmed.slice(6));
                const token = json.choices?.[0]?.delta?.content;
                if (token) {
                  fullText += token;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Parse ACTION_PROPOSAL from full text
        const actionProposalRaw = extractActionProposal(fullText);
        let actionProposal: Record<string, unknown> | null = null;
        if (actionProposalRaw) {
          const proposal = actionProposalRaw as Record<string, unknown>;
          const action_type = (proposal.action_type as string) || "";
          const action_id = (proposal.action_id as string) || genUUID();
          const confirmation_token = (proposal.confirmation_token as string) || genUUID();
          const innerProposal = (proposal.proposal as Record<string, unknown>) || {};
          if (!innerProposal.action_type) innerProposal.action_type = action_type;
          actionProposal = { action_id, action_type, confirmation_token, proposal: innerProposal };
          console.log("[AICoach] Action proposal:", action_type, action_id);
        }

        // Send done event with action_proposal
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, action_proposal: actionProposal })}\n\n`));

        // Message persistence is handled by the frontend after stream completes.

        controller.close();
      },
    });

    return new Response(stream, {
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
    console.error("[AICoach] Unhandled error:", msg);
    return new Response(JSON.stringify({ error: "Internal Server Error", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
