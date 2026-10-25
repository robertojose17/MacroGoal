import {RECOMMENDATION_INSTRUCTIONS,STRUCTURED_MEAL_OUTPUT_INSTRUCTIONS,extractMealRecommendation,recommendationHandoff,recommendationSummary,shouldBufferMealResponse,shouldUseStructuredMealOutput} from './meal-recommendation.ts';
import {savedFoodPreferences,savedFoodContext} from './saved-food-preferences.ts';
import {MEAL_CONVERSATION_INSTRUCTIONS,extractMealConversation,mealConversationStream} from './meal-conversation.ts';
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemini-2.5-pro";

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

function generateSuggestions(assistantMessage: string): string[] | null {
  const msg = assistantMessage.toLowerCase();

  if (
    msg.includes("tracked macros before") ||
    msg.includes("new to this") ||
    msg.includes("experience") ||
    msg.includes("have you tracked") ||
    msg.includes("familiar with")
  ) {
    return ["Brand new to this", "I've tried before", "Yes, I know my stuff"];
  }

  if (
    msg.includes("biggest challenge") ||
    msg.includes("hardest part") ||
    msg.includes("struggle") ||
    msg.includes("what's stopping") ||
    msg.includes("what stops you")
  ) {
    return ["Cravings", "I don't see results", "I keep falling off", "I don't know what to eat"];
  }

  if (
    msg.includes("meal plan") ||
    msg.includes("do you have a plan") ||
    msg.includes("following a plan") ||
    msg.includes("have a plan")
  ) {
    return ["Yes I have one", "No I don't", "I had one but stopped"];
  }

  if (
    msg.includes("cook at home") ||
    msg.includes("eat out") ||
    msg.includes("restaurant") ||
    msg.includes("takeout") ||
    msg.includes("do you cook")
  ) {
    return ["I cook at home", "I eat out a lot", "Mix of both"];
  }

  if (
    msg.includes("hungry") ||
    msg.includes("what can you eat") ||
    msg.includes("calories left") ||
    msg.includes("what to eat") ||
    msg.includes("something to eat")
  ) {
    return ["Log what I ate", "Give me options", "I already ate"];
  }

  if (
    msg.includes("cheated") ||
    msg.includes("messed up") ||
    msg.includes("went over") ||
    msg.includes("off track") ||
    msg.includes("bad day")
  ) {
    return ["It was just one meal", "I went way over", "I want to start fresh tomorrow"];
  }

  if (
    msg.includes("results") ||
    msg.includes("working") ||
    msg.includes("progress") ||
    msg.includes("is it working") ||
    msg.includes("seeing changes")
  ) {
    return ["Show me my progress", "I feel stuck", "What am I doing wrong?"];
  }

  if (
    msg.includes("quit") ||
    msg.includes("give up") ||
    msg.includes("not worth") ||
    msg.includes("want to stop") ||
    msg.includes("frustrated")
  ) {
    return ["I'm just frustrated", "I haven't seen any change", "Help me stay motivated"];
  }

  return null;
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

// Strip MEMORY_UPDATE blocks from text and upsert them into coach_memory
async function processMemoryUpdates(text: string, userId: string): Promise<string> {
  const memoryRegex = /MEMORY_UPDATE:\s*(\{[\s\S]*?\})(?=\s*(?:MEMORY_UPDATE:|ACTION_PROPOSAL:|$))/g;
  const matches = [...text.matchAll(memoryRegex)];
  if (matches.length === 0) return text;

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const key = parsed.key as string;
      const value = parsed.value as string;
      const category = (parsed.category as string) || "general";
      if (key && value) {
        await supabase.from("coach_memory").upsert(
          { user_id: userId, key, value, category, updated_at: new Date().toISOString() },
          { onConflict: "user_id,key" }
        );
        console.log("[AICoach] Memory upserted:", key, "=", value, "category:", category);
      }
    } catch (e) {
      console.warn("[AICoach] Failed to parse MEMORY_UPDATE:", match[1], e);
    }
  }

  // Strip all MEMORY_UPDATE blocks from the visible text
  return text.replace(/MEMORY_UPDATE:\s*\{[\s\S]*?\}(?=\s*(?:MEMORY_UPDATE:|ACTION_PROPOSAL:|$))/g, "").trim();
}

const handler = (async (req:Request, control?:{providerFetch:typeof fetch}) => {
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
      is_returning_user_open?: boolean;
      language?: string;
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
    const language = body.language === "es" ? "es" : "en";
    const isReturningUserOpen = body.is_returning_user_open === true;
    console.log("[AICoach] language:", language, "returning_user_open:", isReturningUserOpen);

    if (!messages.length) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sentinel detection
    const lastMessageContent = messages[messages.length - 1]?.content;
    const isFirstInteraction = body.is_first_message === true || lastMessageContent === "__FIRST_INTERACTION__";
    const isReturningOpen = isReturningUserOpen || lastMessageContent === "__RETURNING_USER_OPEN__";

    // Subscription gating is handled by the frontend (coach.tsx) â€” backend only verifies auth.

    const userId = authUser.id;
    const today = new Date().toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [
      profileResult,
      goalsResult,
      mealsResult,
      checkInsResult,
      memoryResult,
      tdeeResult,
      trackerEntriesResult,
      coachActionsResult,
      lastInsightResult,
    ] = await Promise.all([
      supabase.from("users").select("name, username, sex, date_of_birth, height, current_weight, goal_weight, activity_level, weight_unit, dietary_restrictions, protein_preferences, recipe_styles, disliked_foods").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("daily_calories, protein_g, carbs_g, fats_g, fiber_g, goal_type, macro_preset").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("meals").select("date, meal_items(calories, protein, carbs, fats, fiber)").eq("user_id", userId).gte("date", fourteenDaysAgo).lte("date", today).order("date", { ascending: false }),
      supabase.from("check_ins").select("date, weight").eq("user_id", userId).gte("date", thirtyDaysAgo).order("date", { ascending: false }).limit(30),
      supabase.from("coach_memory").select("key, value, category").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50),
      supabase.from("tdee_estimates").select("week_start, estimated_tdee, prescribed_calories, adjustment_amount, avg_calories_eaten, avg_weight_lbs, prev_avg_weight_lbs, data_days_count, adjustment_applied").eq("user_id", userId).order("week_start", { ascending: false }).limit(4),
      supabase.from("tracker_entries").select("date, value, tracker_id, trackers(name, emoji, unit, goal_value)").eq("user_id", userId).gte("date", sevenDaysAgo).lte("date", today).order("date", { ascending: false }),
      supabase.from("coach_actions").select("action_type, new_value, created_at, status").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      // Fetch latest unread insight for returning user open
      supabase.from("coach_daily_insights").select("insight_text, condition_type, created_at").eq("user_id", userId).eq("is_read", false).order("created_at", { ascending: false }).limit(1),
    ]);

    if(profileResult.error)throw Error("profile_context_unavailable");
    const profile = profileResult.data;
    const savedPreferences = savedFoodPreferences(profile);
    const goals = Array.isArray(goalsResult.data) ? goalsResult.data[0] ?? null : goalsResult.data;
    const mealsRaw = mealsResult.data || [];
    const checkIns = checkInsResult.data || [];
    const memoryItems = memoryResult.data || [];
    const tdeeRows = tdeeResult.data || [];
    const trackerEntries = trackerEntriesResult.data || [];
    const coachActions = coachActionsResult.data || [];
    const latestInsight = lastInsightResult.data?.[0] || null;

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

    // Today's nutrition
    const todayNutrition = nutritionByDate[today] || null;

    // Food patterns: last 7 days avg
    const last7Days = nutritionLogs.filter((l) => l.date >= sevenDaysAgo);
    const foodPatternBlock = last7Days.length > 0
      ? (() => {
          const avg = last7Days.reduce((acc, l) => {
            acc.calories += l.calories;
            acc.protein += l.protein;
            acc.carbs += l.carbs;
            acc.fats += l.fats;
            return acc;
          }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
          const n = last7Days.length;
          return `FOOD PATTERNS (last 7 days avg, ${n} days logged):\n- Avg calories: ${Math.round(avg.calories / n)} kcal\n- Avg protein: ${Math.round(avg.protein / n)}g\n- Avg carbs: ${Math.round(avg.carbs / n)}g\n- Avg fats: ${Math.round(avg.fats / n)}g`;
        })()
      : "FOOD PATTERNS (last 7 days): No data logged";

    // Streak / consistency
    const loggedDates = new Set(nutritionLogs.map((l) => l.date));
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      if (loggedDates.has(d)) streak++;
      else break;
    }
    const consistencyDays = loggedDates.size;
    const streakBlock = `STREAK & CONSISTENCY:\n- Current logging streak: ${streak} day${streak !== 1 ? "s" : ""}\n- Total days logged (last 14): ${consistencyDays}`;

    console.log("[AICoach] Context â€” profile:", !!profile, "goals:", !!goals, "nutrition days:", nutritionLogs.length, "weight:", checkIns.length, "tdee rows:", tdeeRows.length, "tracker entries:", trackerEntries.length, "coach actions:", coachActions.length);

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
      ? `USER PROFILE:\n- Name: ${(profile as any).name || (profile as any).username || "User"}\n- Age: ${age}\n- Height: ${(profile as any).height ? `${(profile as any).height} cm` : "unknown"}\n- Sex: ${(profile as any).sex || "unknown"}\n- Current weight: ${(profile as any).current_weight ? `${toDisplayWeight((profile as any).current_weight)} ${wUnit}` : "unknown"}\n- Goal weight: ${(profile as any).goal_weight ? `${toDisplayWeight((profile as any).goal_weight)} ${wUnit}` : "unknown"}\n- Activity level: ${(profile as any).activity_level || "unknown"}`
      : "USER PROFILE: Not available";

    let nutritionBlock = "RECENT NUTRITION (last 14 days):\n";
    if (nutritionLogs.length > 0) {
      for (const log of nutritionLogs) {
        nutritionBlock += `- ${log.date}: ${Math.round(log.calories)} cal | P: ${Math.round(log.protein)}g | C: ${Math.round(log.carbs)}g | F: ${Math.round(log.fats)}g\n`;
      }
    } else {
      nutritionBlock += "- No nutrition data logged yet\n";
    }

    // Today's nutrition block
    const todayBlock = todayNutrition
      ? `TODAY (${today}):\n- Calories logged: ${Math.round(todayNutrition.calories)} kcal${goals ? ` / ${(goals as any).daily_calories ?? "?"} target` : ""}\n- Protein: ${Math.round(todayNutrition.protein)}g${goals ? ` / ${(goals as any).protein_g ?? "?"}g target` : ""}\n- Carbs: ${Math.round(todayNutrition.carbs)}g | Fats: ${Math.round(todayNutrition.fats)}g`
      : `TODAY (${today}): Nothing logged yet`;

    const goalsBlock = goals
      ? `CURRENT DAILY TARGETS:\n- Daily calories: ${(goals as any).daily_calories ?? "not set"} kcal\n- Protein: ${(goals as any).protein_g ?? "not set"}g\n- Carbs: ${(goals as any).carbs_g ?? "not set"}g\n- Fats: ${(goals as any).fats_g ?? "not set"}g\n- Goal type: ${(goals as any).goal_type || "not set"}`
      : "CURRENT DAILY TARGETS: Not set";

    // Adaptive TDEE block
    let tdeeBlock = "ADAPTIVE TDEE HISTORY (last 4 weeks):\n";
    if (tdeeRows.length > 0) {
      for (const row of tdeeRows) {
        const r = row as any;
        tdeeBlock += `- Week of ${r.week_start}: estimated TDEE ${r.estimated_tdee ?? "?"} kcal | prescribed ${r.prescribed_calories ?? "?"} kcal | avg eaten ${r.avg_calories_eaten != null ? Math.round(r.avg_calories_eaten) : "?"} kcal | avg weight ${r.avg_weight_lbs != null ? r.avg_weight_lbs.toFixed(1) : "?"} ${wUnit} | adjustment ${r.adjustment_amount != null ? (r.adjustment_amount >= 0 ? "+" : "") + r.adjustment_amount : "?"} kcal | applied: ${r.adjustment_applied ? "yes" : "no"}\n`;
      }
    } else {
      tdeeBlock += "- No TDEE adjustment history yet\n";
    }

    let weightBlock = "WEIGHT TREND (last 30 days):\n";
    if (checkIns.length > 0) {
      for (const w of checkIns) {
        weightBlock += `- ${(w as any).date}: ${toDisplayWeight((w as any).weight)} ${wUnit}\n`;
      }
    } else {
      weightBlock += "- No weight data\n";
    }

    // Trackers block
    let trackersBlock = "HABIT TRACKERS (last 7 days):\n";
    if (trackerEntries.length > 0) {
      // Group entries by tracker
      const trackerMap: Record<string, { name: string; emoji: string; unit: string; goal_value: number | null; entries: number[] }> = {};
      for (const entry of trackerEntries) {
        const e = entry as any;
        const tid = e.tracker_id as string;
        const tracker = e.trackers as any;
        if (!trackerMap[tid]) {
          trackerMap[tid] = {
            name: tracker?.name || tid,
            emoji: tracker?.emoji || "",
            unit: tracker?.unit || "",
            goal_value: tracker?.goal_value ?? null,
            entries: [],
          };
        }
        trackerMap[tid].entries.push(Number(e.value) || 0);
      }
      for (const [, t] of Object.entries(trackerMap)) {
        const avg = t.entries.reduce((a, b) => a + b, 0) / t.entries.length;
        const daysHitGoal = t.goal_value != null ? t.entries.filter((v) => v >= t.goal_value!).length : null;
        const goalStr = t.goal_value != null ? ` (goal: ${t.goal_value}${t.unit ? " " + t.unit : ""})` : "";
        const hitStr = daysHitGoal != null ? ` â€” ${daysHitGoal} day${daysHitGoal !== 1 ? "s" : ""} hit goal` : "";
        trackersBlock += `- ${t.emoji ? t.emoji + " " : ""}${t.name}: ${t.entries.length} entries â€” avg ${avg.toFixed(1)}${t.unit ? " " + t.unit : ""}/day${goalStr}${hitStr}\n`;
      }
    } else {
      trackersBlock += "- No habit trackers set up yet\n";
    }

    // Build memory block grouped by category
    let memoryBlock = "COACH MEMORY:\n";
    if (memoryItems.length > 0) {
      // Group by category
      const categoryMap: Record<string, { key: string; value: string }[]> = {};
      for (const m of memoryItems) {
        const cat = (m as any).category || "general";
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push({ key: (m as any).key, value: (m as any).value });
      }
      const categoryOrder = ["food_preferences", "restrictions", "schedule", "results", "onboarding", "general"];
      const allCats = [...new Set([...categoryOrder, ...Object.keys(categoryMap)])];
      for (const cat of allCats) {
        if (!categoryMap[cat] || categoryMap[cat].length === 0) continue;
        memoryBlock += `[${cat}]\n`;
        for (const item of categoryMap[cat]) {
          memoryBlock += `- ${item.key}: ${item.value}\n`;
        }
        memoryBlock += "\n";
      }
    } else {
      memoryBlock += "- No memory yet\n";
    }

    // Coach actions block
    let coachActionsBlock = "COACH ACTION HISTORY (what I've done for this user):\n";
    if (coachActions.length > 0) {
      for (const action of coachActions) {
        const a = action as any;
        const dateStr = a.created_at ? new Date(a.created_at).toISOString().split("T")[0] : "unknown date";
        const newValStr = a.new_value ? ` â€” ${JSON.stringify(a.new_value)}` : "";
        coachActionsBlock += `- ${dateStr}: ${a.action_type}${newValStr} (status: ${a.status || "unknown"})\n`;
      }
    } else {
      coachActionsBlock += "- No previous coach actions\n";
    }

    // Build returning user context block for __RETURNING_USER_OPEN__
    let returningUserContextBlock = "";
    if (isReturningOpen) {
      const recentLogDays = nutritionLogs.length;
      const last7LogDays = last7Days.length;
      const avgProteinLast7 = last7Days.length > 0
        ? Math.round(last7Days.reduce((s, l) => s + l.protein, 0) / last7Days.length)
        : null;
      const avgCaloriesLast7 = last7Days.length > 0
        ? Math.round(last7Days.reduce((s, l) => s + l.calories, 0) / last7Days.length)
        : null;
      const proteinGoal = goals ? (goals as any).protein_g : null;
      const calorieGoal = goals ? (goals as any).daily_calories : null;

      // Weight trend
      let weightTrendNote = "";
      if (checkIns.length >= 2) {
        const newest = checkIns[0] as any;
        const oldest = checkIns[checkIns.length - 1] as any;
        const diffLbs = (Number(newest.weight) - Number(oldest.weight)) * 2.20462;
        if (Math.abs(diffLbs) >= 0.5) {
          weightTrendNote = diffLbs < 0
            ? `down ${Math.abs(diffLbs).toFixed(1)} ${wUnit} over the last ${checkIns.length} weigh-ins`
            : `up ${diffLbs.toFixed(1)} ${wUnit} over the last ${checkIns.length} weigh-ins`;
        }
      }

      // Unread insight from nightly analysis
      const insightNote = latestInsight
        ? `UNREAD COACH INSIGHT (from nightly analysis, condition: ${(latestInsight as any).condition_type}): "${(latestInsight as any).insight_text}"`
        : "";

      returningUserContextBlock = `
RETURNING USER OPEN CONTEXT:
- Streak: ${streak} day${streak !== 1 ? "s" : ""} logged in a row
- Days logged last 7: ${last7LogDays}
- Avg calories last 7 days: ${avgCaloriesLast7 ?? "no data"}${calorieGoal ? ` / ${calorieGoal} goal` : ""}
- Avg protein last 7 days: ${avgProteinLast7 ?? "no data"}${proteinGoal ? `g / ${proteinGoal}g goal` : ""}
${weightTrendNote ? `- Weight trend: ${weightTrendNote}` : ""}
${insightNote}
`;
    }

    // Derive onboarding state from coach_memory for use in the system prompt
    const memoryMap: Record<string, string> = {};
    for (const m of memoryItems) {
      memoryMap[(m as any).key] = (m as any).value;
    }
    const hasExperience = !!memoryMap["onboarding_experience"];
    const hasChallenge = !!memoryMap["onboarding_challenge"];

    const languageInstruction = `RESPONSE LANGUAGE: Reply in the language of the latest substantive user message, even when it differs from the app UI locale or your earlier replies. If the CURRENT user message explicitly requests a reply language, honor it for this response only. A language request in an earlier turn must not override the language of a later substantive user message. For a language-ambiguous message such as "OK", a number, an emoji, or a food/restaurant name alone, follow the most recent substantive user message in this conversation. Only when no such language context exists, use the app UI locale (${language === "es" ? "Spanish" : "English"}). Do not let an earlier assistant reply or the language of these instructions override the user. UI locale controls interface labels separately. Do not ask the user to change it.`;

    const systemPrompt = `You are an expert AI nutrition and fitness coach inside the Macro Goal app.

${languageInstruction}

FORMATTING RULES (non-negotiable):
- Never use dashes, bullet points, asterisks, bold markers (**), or any markdown formatting
- Write in plain natural prose, like a real person texting
- No lists, no headers, no em-dashes, no hyphens used as list markers
- Short paragraphs separated by line breaks only

${profileBlock}
${savedFoodContext(savedPreferences)}

${goalsBlock}

${tdeeBlock}
${nutritionBlock}
${todayBlock}

${foodPatternBlock}

${streakBlock}

${weightBlock}
${trackersBlock}
${memoryBlock}

${coachActionsBlock}
${returningUserContextBlock}
Today: ${today}

DIRECT HELP AND SAVED CONTEXT:
- Answer the current request immediately. A request for food or a meal is never blocked by onboarding, message count, tracking experience or lifestyle questions.
- Use the saved dietary restrictions, food preferences, current daily targets and remaining macros already supplied above. Do not ask the user to fill them again.
- For a meal request, propose one useful editable meal with explicit estimated portions and numbers. Ask at most one question only if essential information is genuinely missing.
- If portions or preparation are assumed, disclose that they are estimates; never describe guessed restaurant nutrition as official or say a meal fits perfectly without numerical support.
- Learn optional background naturally when relevant; never divert a food request into a questionnaire. Never invent their routine or interpret a preference as an allergy.

MEMORY CATEGORIZATION RULES â€” when using save_memory, always pick the right category:
- User mentions food they like or dislike (e.g. "I love chicken", "I hate broccoli") â†’ category: food_preferences
- User mentions dietary restrictions (no pork, lactose intolerant, vegan, gluten-free, allergies) â†’ category: restrictions
- User mentions their schedule (works nights, trains mornings, busy on weekends, meal preps Sundays) â†’ category: schedule
- User mentions past results (lost X lbs, gained muscle, hit a plateau in month X, best weight was Y) â†’ category: results
- Onboarding keys (onboarding_experience, onboarding_challenge, onboarding_meal_plan) â†’ category: onboarding
- Everything else â†’ category: general

TONE BY EXPERIENCE LEVEL (apply once onboarding_experience is known):
- beginner: explain terms, be encouraging, never assume knowledge, celebrate small wins
- intermediate: direct, use numbers, light explanation only when needed
- advanced: technical, straight to the point, no hand-holding, assume full macro literacy

When you receive [FIRST_INTERACTION_TRIGGER], write a welcome message that:
- Starts with a warm, brief self-introduction: who you are and what you do (1-2 sentences max)
- Acknowledges their specific goal (use their actual goal from the profile context)
- ${!hasExperience ? 'Ends with ONE natural question about their experience level â€” e.g. "Before I put together anything for you â€” have you tracked macros before, or is this new territory for you?"' : !hasChallenge ? 'Ends with ONE natural question about their biggest challenge right now' : 'Goes straight to value â€” you already know their experience and challenge, so give a useful first insight or ask about their lifestyle'}
- Total length: 3-4 sentences maximum
- No dashes, no bullets, no markdown, no lists
- Do NOT mention macros, calories, or targets in the welcome
- Do NOT offer a meal plan, strategy, or any deliverable in the welcome
- Sound like a real coach introducing themselves, not a software product
- Example tone: "Hi, I'm your nutrition and body transformation coach. I can see you're working toward [their goal] and I'm here to help you get there with a plan built around your actual life. Before I put anything together â€” have you tracked macros before, or is this new territory for you?"

When you receive [RETURNING_USER_OPEN], write a proactive opening message that:
- MUST reference something SPECIFIC from the RETURNING USER OPEN CONTEXT above â€” use the actual numbers (streak days, avg protein, avg calories, weight trend, or the unread insight if present)
- If there is an UNREAD COACH INSIGHT, lead with that insight naturally â€” mention what you noticed and why it matters, then ask one actionable question
- If no unread insight, pick the single most interesting data point from the context (e.g. streak, protein gap, weight trend) and reference it with the exact number
- Do NOT give a generic "welcome back" or "great to see you" opener
- Do NOT ask how they're doing or how things are going
- Do NOT give a full analysis or list multiple observations
- 2-3 sentences max, no markdown, no lists
- Example (streak): "You've logged 6 days in a row â€” that's real momentum. Your protein has been averaging about 20g under your goal though. Want to fix that today?"
- Example (insight): "I noticed your weight has barely moved even though your calories look right â€” your protein has been consistently low at around 85g vs your 140g goal. That's likely what's stalling things. Want to talk about it?"
- Example (weight trend): "You're down 2.3 lbs over the last two weeks â€” that's right on track. What are we working on today?"

In subsequent messages, if onboarding_experience or onboarding_challenge are not yet in memory, weave in ONE question naturally when the moment is right. Never interrupt a direct question the user asked just to collect onboarding data â€” answer them first, then ask.

ADAPTIVE TDEE AWARENESS:
- The app automatically adjusts the user's calorie target weekly based on actual intake vs weight change.
- If the TDEE history shows consistent adjustments downward, the user may be in a prolonged deficit â€” consider recommending a diet break or maintenance week.
- If prescribed calories keep dropping but weight isn't moving, the user may be underreporting food.
- Reference specific weeks and numbers when discussing calorie adjustments.

TRACKER AWARENESS:
- Low sleep (under 7 hrs) correlates with increased hunger and cravings â€” mention this if the user complains about hunger or cravings.
- Low water intake can cause false hunger signals â€” mention this if the user is struggling with overeating.
- Low steps combined with a calorie deficit may slow metabolism â€” consider recommending NEAT (non-exercise activity thermogenesis).

COACH ACTIONS AWARENESS:
- The COACH ACTION HISTORY shows changes you previously made for this user. Reference them naturally.
- If you adjusted calories recently, acknowledge it: "I lowered your calories last week to X â€” how has that been feeling?"
- Never propose the same action twice in a row without checking if the previous one was effective.

INSTRUCTIONS:
- Answer directly and concisely. Use the user's actual data.
- Keep responses under 6 short lines unless detail is explicitly requested.
- CRITICAL: When the user asks for a meal plan, write only a 1-2 sentence summary then append ACTION_PROPOSAL JSON. Never write the full plan as text.
- CRITICAL: When proposing a goal change, write only 1-2 sentences then append ACTION_PROPOSAL JSON.
- CRITICAL: When adding food to diary, write only 1 sentence then append ACTION_PROPOSAL JSON.
- When proposing a goal change: ACTION_PROPOSAL: {"action_type":"update_goal","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_value":...,"proposed_value":...,"expected_effect":"..."}}
- When creating a meal plan: ACTION_PROPOSAL: {"action_type":"create_meal_plan","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"plan_name":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","reason":"...","days":[{"date":"YYYY-MM-DD","meals":[{"meal_type":"breakfast","food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"fiber":0,"grams":0,"quantity":1,"serving_unit":"serving","dish_description":"..."}]}]}}
- When adding food to diary: ACTION_PROPOSAL: {"action_type":"add_food_to_diary","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"food_name":"...","calories":0,"protein":0,"carbs":0,"fats":0,"date":"YYYY-MM-DD","meal_type":"lunch","quantity":1,"serving_unit":"serving"}}
- When recommending a calorie adjustment based on data: write 1-2 sentences with the evidence, then append ACTION_PROPOSAL: {"action_type":"adjust_calories","action_id":"<uuid>","confirmation_token":"<uuid>","proposal":{"reason":"...","current_calories":<number>,"proposed_calories":<number>,"adjustment_amount":<number>,"expected_effect":"...","evidence":"..."}}`;

    const structuredMealOutput=shouldUseStructuredMealOutput(messages);
    const recommendationInstructions=structuredMealOutput?`${RECOMMENDATION_INSTRUCTIONS}\n${STRUCTURED_MEAL_OUTPUT_INSTRUCTIONS}`:RECOMMENDATION_INSTRUCTIONS;
    // Gemini doesn't support system role
    const apiMessages: { role: string; content: string }[] = [
      { role: "user", content: `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n${MEAL_CONVERSATION_INSTRUCTIONS}\n${recommendationInstructions}` },
      { role: "assistant", content: "Understood. I have your full profile, goals, nutrition history, TDEE trends, habit trackers, and coach action history. How can I help?" },
      ...messages.map((m) => ({
        role: m.role,
        content:
          m.content === "__FIRST_INTERACTION__" ? "[FIRST_INTERACTION_TRIGGER]" :
          m.content === "__RETURNING_USER_OPEN__" ? "[RETURNING_USER_OPEN]" :
          m.content,
      })),
    ];

    console.log("[AICoach] Calling OpenRouter streaming, model:", DEFAULT_MODEL, "messages:", apiMessages.length, "structured_meal_output:", structuredMealOutput);

    const chatRes = await (control?.providerFetch??fetch)(`${OPENROUTER_BASE_URL}/chat/completions`, {
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
        ...(structuredMealOutput?{response_format:{type:"json_object"},provider:{require_parameters:true}}:{}),
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
    const bufferMealResponse=shouldBufferMealResponse(messages);
    const stream = new ReadableStream({
      async start(controller) {
        const reader = chatRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullText = ""; const mealStream=mealConversationStream();
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
                  const visible=mealStream.push(token);if(visible&&!bufferMealResponse)controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token:visible })}\n\n`));
                }
              } catch { /* skip malformed */ }
            }
          }
        } finally {
          reader.releaseLock();
        }

        const tail=mealStream.finish();if(tail&&!bufferMealResponse)controller.enqueue(encoder.encode(`data: ${JSON.stringify({token:tail})}\n\n`));
        const mealRecommendation=extractMealRecommendation(fullText,messages,savedPreferences,(stage,code)=>console.info("[AICoach] Meal recommendation rejected",JSON.stringify({request_id:requestId,stage,code})),structuredMealOutput);
        const mealConversation=mealRecommendation.recommendation?{text:mealRecommendation.text,handoff:recommendationHandoff(mealRecommendation.recommendation)}:(mealRecommendation.handled||mealRecommendation.rejected)?{text:mealRecommendation.text,handoff:mealRecommendation.handoff??null}:extractMealConversation(mealRecommendation.text,messages,savedPreferences);
        const lastSubstantive=[...messages].reverse().find((m:any)=>m?.role==='user'&&typeof m.content==='string')?.content??'';
        fullText=mealRecommendation.recommendation?recommendationSummary(mealRecommendation.recommendation,language==='es'||/\b(?:quiero|quisiera|comida|pollo|arroz|dame|agregar|guardar|porci[oó]n|recomienda)\b/i.test(lastSubstantive)):mealConversation.text;
        // Guard: if OpenRouter returned no tokens, send a fallback so the client never gets an empty bubble
        if (fullText.trim().length === 0) {
          console.warn("[AICoach] OpenRouter returned empty response â€” sending fallback token");
          const fallback = language === "es"
            ? "Estoy teniendo problemas para responder en este momento. IntÃ©ntalo de nuevo."
            : "I'm having trouble responding right now. Please try again.";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: fallback })}\n\n`));
          fullText = fallback;
        }

        // Process and strip MEMORY_UPDATE blocks, upsert to coach_memory
        const correctedText = fullText; // Conversational output never authorizes persistence.

        // Parse ACTION_PROPOSAL from full text
        const actionProposalRaw = null;
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

        // Generate suggestions based on assistant message content
        const suggestions = generateSuggestions(correctedText);
        console.log("[AICoach] Suggestions generated:", suggestions ? suggestions.length : 0);

        // Mark the unread insight as read if this was a returning user open
        if (!control && isReturningOpen && latestInsight) {
          try {
            await supabase
              .from("coach_daily_insights")
              .update({ is_read: true })
              .eq("user_id", userId)
              .eq("is_read", false);
          } catch (e) {
            console.warn("[AICoach] Failed to mark insights as read:", e);
          }
        }

        // Send done event with corrected_text, action_proposal, and suggestions
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, corrected_text: correctedText, action_proposal: actionProposal, suggestions, ...(mealConversation.handoff?{meal_conversation:mealConversation.handoff}:{}) })}\n\n`));

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


export default handler;

