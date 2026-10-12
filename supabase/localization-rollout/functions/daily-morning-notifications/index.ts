import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendOneSignalNotification } from "./_shared/onesignal.ts";

// Scheduled: 0 8 * * * (8am UTC daily)
// Sends morning motivation notifications to users active in the last 14 days.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CHUNK_SIZE = 100;

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

Deno.serve(async (_req: Request) => {
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("[daily-morning-notifications] Starting daily run at 8am UTC");

  const today = getTodayUTC();
  const fourteenDaysAgo = subtractDays(today, 14);

  // Fetch users active in the last 14 days from user_xp (last_meal_date replaces last_xp_date)
  const { data: activeXpRows, error: xpError } = await adminClient
    .from("user_xp")
    .select("user_id")
    .gte("last_meal_date", fourteenDaysAgo);

  if (xpError || !activeXpRows) {
    console.error("[daily-morning-notifications] Failed to fetch user_xp:", xpError);
    return new Response(JSON.stringify({ error: "Failed to fetch user_xp" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[daily-morning-notifications] Sending to ${activeXpRows.length} active users`);

  const allUserIds = activeXpRows.map((u: { user_id: string }) => u.user_id);
  let totalNotified = 0;
  let totalChunks = 0;

  // Batch in chunks of 100
  for (let i = 0; i < allUserIds.length; i += CHUNK_SIZE) {
    const chunk = allUserIds.slice(i, i + CHUNK_SIZE);
    try {
      await sendOneSignalNotification({
        userIds: chunk,
        heading: "🌅 New day, new missions!",
        headings_es: "🌅 ¡Nuevo día, nuevas misiones!",
        content: "Your daily missions are ready. Let's hit those goals.",
        contents_es: "Tus misiones diarias están listas. Vamos a cumplir esas metas.",
        data: { screen: "dashboard", action: "daily_missions_ready" },
      });
      totalNotified += chunk.length;
      totalChunks++;
    } catch (err) {
      console.error(`[daily-morning-notifications] Error sending chunk ${i / CHUNK_SIZE + 1}:`, err);
    }
  }

  const summary = {
    today,
    fourteen_days_ago: fourteenDaysAgo,
    active_users: activeXpRows.length,
    total_notified: totalNotified,
    total_api_calls: totalChunks,
  };
  console.log("[daily-morning-notifications] Done:", summary);

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  });
});

