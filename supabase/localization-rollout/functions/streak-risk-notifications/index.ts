import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendOneSignalNotification } from "./_shared/onesignal.ts";

// Scheduled: 0 20 * * * (8pm UTC daily)
// Sends streak-risk push notifications to users who:
//   - have current_streak >= 1 in user_xp
//   - have NOT logged any XP today (checked via xp_ledger)

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHUNK_SIZE = 100;

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

Deno.serve(async (_req: Request) => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("[streak-risk-notifications] Starting daily run at 8pm UTC");

  const today = getTodayUTC();

  // Fetch all users with an active streak from user_xp (single source of truth)
  const { data: usersWithStreak, error: xpError } = await adminClient
    .from("user_xp")
    .select("user_id, current_streak, last_meal_date")
    .gte("current_streak", 1);

  if (xpError || !usersWithStreak) {
    console.error("[streak-risk-notifications] Failed to fetch user_xp:", xpError);
    return new Response(JSON.stringify({ error: "Failed to fetch user_xp" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter to users who haven't logged XP today (fast pre-filter via last_meal_date)
  const candidateUsers = usersWithStreak.filter(
    (u: { last_meal_date: string | null }) => u.last_meal_date !== today
  );

  // Belt-and-suspenders: check xp_ledger for any activity today
  const atRiskUsers: Array<{ id: string; current_streak: number }> = [];

  for (const user of candidateUsers) {
    const { data: ledgerRows } = await adminClient
      .from("xp_ledger")
      .select("id")
      .eq("user_id", user.user_id)
      .eq("date", today)
      .limit(1);

    if (!ledgerRows || ledgerRows.length === 0) {
      atRiskUsers.push({ id: user.user_id, current_streak: user.current_streak });
    }
  }

  console.log(`[streak-risk-notifications] ${atRiskUsers.length} users at risk out of ${usersWithStreak.length} with active streaks`);

  // Batch send in chunks of 100
  let totalNotified = 0;
  let totalChunks = 0;

  for (let i = 0; i < atRiskUsers.length; i += CHUNK_SIZE) {
    const chunk = atRiskUsers.slice(i, i + CHUNK_SIZE);
    const byStreak = new Map<number, string[]>();
    for (const u of chunk) {
      const arr = byStreak.get(u.current_streak) ?? [];
      arr.push(u.id);
      byStreak.set(u.current_streak, arr);
    }

    for (const [streak, userIds] of byStreak.entries()) {
      try {
        await sendOneSignalNotification({
          userIds,
          heading: `🔥 Your ${streak}-day streak is at risk!`,
          headings_es: `🔥 ¡Tu racha de ${streak} días está en riesgo!`,
          content: "Don't lose it now. Log a meal or complete a mission to keep it alive.",
          contents_es: "No la pierdas ahora. Registra una comida o completa una misión para mantenerla.",
          data: { screen: "dashboard", action: "streak_risk" },
        });
        totalNotified += userIds.length;
        totalChunks++;
      } catch (err) {
        console.error(`[streak-risk-notifications] Error sending chunk (streak=${streak}):`, err);
      }
    }
  }

  const summary = {
    today,
    total_users_with_streak: usersWithStreak.length,
    at_risk_users: atRiskUsers.length,
    total_notified: totalNotified,
    total_api_calls: totalChunks,
  };
  console.log("[streak-risk-notifications] Done:", summary);

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});

