import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00Z");
  const b = new Date(dateB + "T00:00:00Z");
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Get the local date string (YYYY-MM-DD) for a given timezone.
 * Falls back to UTC date if the timezone is invalid.
 */
function getLocalDateString(tz: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    if (!y || !m || !d) return now.toISOString().split("T")[0];
    return `${y}-${m}-${d}`;
  } catch {
    return now.toISOString().split("T")[0];
  }
}

/** Clamp days_remaining to [0, 14]. */
function computeDaysRemaining(startDate: string, today: string): number {
  const elapsed = daysBetween(startDate, today);
  return Math.max(0, 14 - elapsed);
}

interface MissionDef {
  mission_type: string;
  title_en: string;
  title_es: string;
  unit: string;
}

const MISSION_MAP: Record<number, MissionDef> = {
  1: { mission_type: "log_first_meal",   title_en: "Log your first meal",                      title_es: "Registra tu primera comida",             unit: "meal" },
  2: { mission_type: "hit_calorie_goal", title_en: "Hit your calorie goal",                    title_es: "Alcanza tu meta de calorías",             unit: "kcal" },
  3: { mission_type: "hit_protein_goal", title_en: "Hit your protein goal",                    title_es: "Alcanza tu meta de proteína",             unit: "g" },
  4: { mission_type: "walk_5000_steps",  title_en: "Walk 5,000 steps",                         title_es: "Camina 5,000 pasos",                     unit: "steps" },
  5: { mission_type: "log_three_meals",  title_en: "Log all 3 meals",                          title_es: "Registra las 3 comidas",                 unit: "meals" },
  6: { mission_type: "complete_workout", title_en: "Complete a workout",                       title_es: "Completa un entrenamiento",               unit: "workout" },
  7: { mission_type: "hit_all_three",    title_en: "Hit calories + protein + 5k steps",        title_es: "Alcanza calorías + proteína + 5k pasos", unit: "" },
};

/**
 * Count meal_items logged today for a user.
 * meal_items doesn't have user_id directly — it joins via meals.user_id and meals.date.
 */
async function countMealItemsToday(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  today: string
): Promise<number> {
  const { data: meals } = await adminClient
    .from("meals")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today);

  if (!meals || meals.length === 0) return 0;

  const mealIds = meals.map((m: { id: string }) => m.id);
  const { count } = await adminClient
    .from("meal_items")
    .select("id", { count: "exact", head: true })
    .in("meal_id", mealIds);

  return count ?? 0;
}

async function computeMissionProgress(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  day: number,
  today: string
): Promise<{ current: number; target: number }> {
  try {
    if (day === 1) {
      const count = await countMealItemsToday(adminClient, userId, today);
      return { current: Math.min(count, 1), target: 1 };
    }

    if (day === 2) {
      const { data: meals } = await adminClient.from("meals").select("id").eq("user_id", userId).eq("date", today);
      let totalCals = 0;
      if (meals && meals.length > 0) {
        const mealIds = meals.map((m: { id: string }) => m.id);
        const { data: items } = await adminClient.from("meal_items").select("calories").in("meal_id", mealIds);
        totalCals = Math.round((items ?? []).reduce((s: number, i: { calories: number }) => s + (i.calories ?? 0), 0));
      }
      const { data: goal } = await adminClient.from("goals").select("daily_calories").eq("user_id", userId).eq("is_active", true).maybeSingle();
      const goalCals = goal?.daily_calories ?? 2000;
      return { current: totalCals, target: goalCals };
    }

    if (day === 3) {
      const { data: meals } = await adminClient.from("meals").select("id").eq("user_id", userId).eq("date", today);
      let totalProtein = 0;
      if (meals && meals.length > 0) {
        const mealIds = meals.map((m: { id: string }) => m.id);
        const { data: items } = await adminClient.from("meal_items").select("protein").in("meal_id", mealIds);
        totalProtein = Math.round((items ?? []).reduce((s: number, i: { protein: number }) => s + (i.protein ?? 0), 0));
      }
      const { data: goal } = await adminClient.from("goals").select("protein_g").eq("user_id", userId).eq("is_active", true).maybeSingle();
      const goalProtein = goal?.protein_g ?? 150;
      return { current: totalProtein, target: goalProtein };
    }

    if (day === 4) {
      let steps = 0;
      const { data: ledgerRows } = await adminClient
        .from("xp_ledger")
        .select("metadata")
        .eq("user_id", userId)
        .eq("event_type", "steps")
        .eq("date", today)
        .order("created_at", { ascending: false })
        .limit(1);
      if (ledgerRows && ledgerRows.length > 0) {
        const meta = ledgerRows[0].metadata as Record<string, unknown>;
        steps = Number(meta?.steps ?? meta?.step_count ?? 0);
      }
      if (steps === 0) {
        const { data: trackerRows } = await adminClient.from("trackers").select("id").eq("user_id", userId).ilike("name", "steps");
        if (trackerRows && trackerRows.length > 0) {
          const trackerIds = trackerRows.map((t: { id: string }) => t.id);
          const { data: entryRows } = await adminClient.from("tracker_entries").select("value").eq("user_id", userId).eq("date", today).in("tracker_id", trackerIds).order("created_at", { ascending: false }).limit(1);
          if (entryRows && entryRows.length > 0) steps = Number(entryRows[0].value) ?? 0;
        }
      }
      if (steps === 0) {
        const { data: ci } = await adminClient.from("check_ins").select("steps").eq("user_id", userId).eq("date", today).maybeSingle();
        steps = ci?.steps ?? 0;
      }
      return { current: steps, target: 5000 };
    }

    if (day === 5) {
      const { data: meals } = await adminClient
        .from("meals")
        .select("meal_type")
        .eq("user_id", userId)
        .eq("date", today);
      const distinctTypes = new Set(
        (meals ?? []).map((m: { meal_type: string }) => m.meal_type).filter((t: string) => ["breakfast", "lunch", "dinner"].includes(t))
      );
      return { current: distinctTypes.size, target: 3 };
    }

    if (day === 6) {
      const [ledgerRows, ciRow] = await Promise.all([
        adminClient.from("xp_ledger").select("id").eq("user_id", userId).eq("event_type", "workout").eq("date", today).limit(1),
        adminClient.from("check_ins").select("went_to_gym").eq("user_id", userId).eq("date", today).maybeSingle(),
      ]);
      const done = (ledgerRows.data ?? []).length > 0 || ciRow.data?.went_to_gym === true;
      return { current: done ? 1 : 0, target: 1 };
    }

    if (day === 7) {
      const { data: missionRow } = await adminClient.from("daily_missions").select("mission_1_type, mission_1_completed, mission_2_type, mission_2_completed, mission_3_type, mission_3_completed").eq("user_id", userId).eq("date", today).maybeSingle();
      let caloriesDone = false;
      let proteinDone = false;
      if (missionRow) {
        const slots = [
          { type: missionRow.mission_1_type, completed: missionRow.mission_1_completed },
          { type: missionRow.mission_2_type, completed: missionRow.mission_2_completed },
          { type: missionRow.mission_3_type, completed: missionRow.mission_3_completed },
        ];
        caloriesDone = slots.some(s => s.type === "stay_within_calories" && s.completed);
        proteinDone = slots.some(s => s.type === "hit_protein_goal" && s.completed);
      }
      let steps = 0;
      const { data: ledgerRows } = await adminClient.from("xp_ledger").select("metadata").eq("user_id", userId).eq("event_type", "steps").eq("date", today).order("created_at", { ascending: false }).limit(1);
      if (ledgerRows && ledgerRows.length > 0) {
        const meta = ledgerRows[0].metadata as Record<string, unknown>;
        steps = Number(meta?.steps ?? meta?.step_count ?? 0);
      }
      if (steps === 0) {
        const { data: ci } = await adminClient.from("check_ins").select("steps").eq("user_id", userId).eq("date", today).maybeSingle();
        steps = ci?.steps ?? 0;
      }
      const stepsDone = steps >= 5000;
      return { current: [caloriesDone, proteinDone, stepsDone].filter(Boolean).length, target: 3 };
    }
  } catch (e) {
    console.error(`[get-seven-day-challenge] computeMissionProgress error day=${day}:`, e);
  }
  return { current: 0, target: 1 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return json({ error: "Unauthorized" }, 401);
    const userId = user.id;

    // ── Fetch user timezone ──────────────────────────────────────────────────
    const { data: userRow } = await adminClient
      .from("users")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    const userTz = (userRow?.timezone as string) || "UTC";

    // ── Compute local today in user's timezone ───────────────────────────────
    const now = new Date();
    const today = getLocalDateString(userTz, now);

    // Fetch challenge (any status — we may need to expire it)
    const { data: challenge, error: fetchError } = await adminClient
      .from("seven_day_challenges")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("[get-seven-day-challenge] Fetch error:", fetchError);
      return json({ error: "Failed to fetch challenge" }, 500);
    }

    if (!challenge) {
      return json({ challenge: null });
    }

    const daysSinceStart = daysBetween(challenge.start_date as string, today);

    // ── 14-day expiration window ────────────────────────────────────────────
    // Days 0–13 are valid (14 days inclusive). Day 14+ → expired.
    if (challenge.status === "active" && daysSinceStart >= 14) {
      const { data: updated } = await adminClient
        .from("seven_day_challenges")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select()
        .single();
      const row = updated ?? challenge;
      return json({
        challenge: {
          id: row.id,
          start_date: row.start_date,
          current_day: row.current_day,
          completed_days: row.completed_days ?? [],
          status: "expired",
          badge_awarded: row.badge_awarded,
          is_today_completed: false,
          days_remaining: 0,
        },
      });
    }

    // If not active, return as-is with days_remaining = 0
    if (challenge.status !== "active") {
      return json({
        challenge: {
          id: challenge.id,
          start_date: challenge.start_date,
          current_day: challenge.current_day,
          completed_days: challenge.completed_days ?? [],
          status: challenge.status,
          badge_awarded: challenge.badge_awarded,
          is_today_completed: false,
          days_remaining: 0,
        },
      });
    }

    // Active challenge within the 14-day window
    const daysRemaining = computeDaysRemaining(challenge.start_date as string, today);
    const completedDays = (challenge.completed_days as string[]) ?? [];
    const isTodayCompleted = completedDays.includes(today);
    const missionDef = MISSION_MAP[challenge.current_day as number] ?? MISSION_MAP[1];

    // Compute live progress for today's mission
    const progress = await computeMissionProgress(adminClient, userId, challenge.current_day as number, today);

    const todaysMission = {
      day: challenge.current_day,
      mission_type: missionDef.mission_type,
      title_en: missionDef.title_en,
      title_es: missionDef.title_es,
      target: progress.target,
      current: isTodayCompleted ? progress.target : progress.current,
      unit: missionDef.unit,
    };

    return json({
      challenge: {
        id: challenge.id,
        start_date: challenge.start_date,
        current_day: challenge.current_day,
        completed_days: completedDays,
        status: challenge.status,
        badge_awarded: challenge.badge_awarded,
        is_today_completed: isTodayCompleted,
        todays_mission: todaysMission,
        days_remaining: daysRemaining,
      },
    });
  } catch (err) {
    console.error("[get-seven-day-challenge] Unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});
