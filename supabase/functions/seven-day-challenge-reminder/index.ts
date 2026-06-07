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
 * Get the local hour (0-23) for a given timezone using Intl.
 * Falls back to UTC hour if the timezone is invalid.
 */
function getLocalHour(tz: string, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const hourPart = parts.find((p) => p.type === "hour");
    if (!hourPart) return now.getUTCHours();
    // Intl hour12:false can return "24" for midnight — normalise to 0
    const h = parseInt(hourPart.value, 10);
    return h === 24 ? 0 : h;
  } catch {
    return now.getUTCHours();
  }
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

async function sendPush(externalUserId: string, heading: string, content: string): Promise<void> {
  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const restKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
  if (!appId || !restKey) {
    console.error("[reminder] Missing OneSignal credentials");
    return;
  }
  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${restKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_aliases: { external_id: [externalUserId] },
      target_channel: "push",
      headings: { en: heading },
      contents: { en: content },
    }),
  });
  if (!res.ok) {
    console.error("[reminder] OneSignal error", res.status, await res.text());
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcDateStr = now.toISOString().split("T")[0];

    // Fetch all active challenges (no date filter — we handle expiry per-user)
    const { data: challenges, error: fetchError } = await adminClient
      .from("seven_day_challenges")
      .select("id, user_id, start_date, current_day, completed_days, status")
      .eq("status", "active");

    if (fetchError) {
      console.error("[reminder] Fetch error:", fetchError);
      return json({ error: "Failed to fetch challenges" }, 500);
    }

    // Fetch timezone for all relevant users in one query
    const userIds = (challenges ?? []).map((c) => c.user_id as string);
    let tzMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: userRows, error: tzError } = await adminClient
        .from("users")
        .select("id, timezone")
        .in("id", userIds);
      if (tzError) {
        console.error("[reminder] Timezone fetch error:", tzError);
      } else {
        for (const row of userRows ?? []) {
          tzMap[row.id as string] = (row.timezone as string) || "";
        }
      }
    }

    let checked = 0;
    let sent = 0;
    let expired = 0;
    let skippedHour = 0;
    let skippedCompleted = 0;

    for (const challenge of (challenges ?? [])) {
      checked++;
      const userId = challenge.user_id as string;
      const startDate = challenge.start_date as string;

      // ── Resolve user timezone ─────────────────────────────────────────────
      const userTz = tzMap[userId] || "";
      const effectiveTz = userTz || "UTC";

      // ── Compute local date and hour for this user ─────────────────────────
      const localDateStr = getLocalDateString(effectiveTz, now);
      const localHour = getLocalHour(effectiveTz, now);

      // ── Auto-expire challenges past 14 days (run every tick, not just 6 PM)
      const daysSinceStart = daysBetween(startDate, localDateStr);
      if (daysSinceStart >= 14) {
        await adminClient
          .from("seven_day_challenges")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", challenge.id);
        expired++;
        console.log(
          `[reminder] userId=${userId} tz=${effectiveTz} localHour=${localHour} localDate=${localDateStr} → EXPIRED (day ${daysSinceStart})`
        );
        continue;
      }

      // ── Local-hour filter: only notify at 6 PM local time ────────────────
      // If user has no tz set, fall back to UTC 18:00
      const targetHour = 18;
      const shouldSendNow = userTz
        ? localHour === targetHour
        : utcHour === targetHour;

      if (!shouldSendNow) {
        skippedHour++;
        console.log(
          `[reminder] userId=${userId} tz=${effectiveTz} localHour=${localHour} utcHour=${utcHour} → SKIPPED (not 18:00 local)`
        );
        continue;
      }

      // ── Skip if user already completed today (in their local timezone) ───
      const completedDays = (challenge.completed_days as string[]) ?? [];
      if (completedDays.includes(localDateStr)) {
        skippedCompleted++;
        console.log(
          `[reminder] userId=${userId} tz=${effectiveTz} localHour=${localHour} localDate=${localDateStr} → SKIPPED (already completed today)`
        );
        continue;
      }

      // ── Compute urgency and pick message ─────────────────────────────────
      const daysRemaining = Math.max(0, 14 - daysSinceStart);

      if (daysRemaining === 0) {
        console.log(
          `[reminder] userId=${userId} tz=${effectiveTz} localHour=${localHour} → SKIPPED (daysRemaining=0, expiring today)`
        );
        continue;
      }

      let heading: string;
      let content: string;

      if (daysRemaining >= 4) {
        heading = "Keep your challenge alive 💪";
        content = "Complete today's mission to stay on track.";
      } else if (daysRemaining === 3 || daysRemaining === 2) {
        heading = "⚠️ Challenge ending soon";
        content = `Your 7-Day Challenge expires in ${daysRemaining} days. Don't give up now!`;
      } else if (daysRemaining === 1) {
        heading = "🚨 Last chance!";
        content = "Your 7-Day Challenge expires tomorrow. Complete today's mission now.";
      } else {
        continue;
      }

      // ── Send push notification ───────────────────────────────────────────
      try {
        await sendPush(userId, heading, content);
        sent++;
        console.log(
          `[reminder] userId=${userId} tz=${effectiveTz} localHour=${localHour} localDate=${localDateStr} daysRemaining=${daysRemaining} → SENT`
        );
      } catch (pushErr) {
        console.error(`[reminder] Push error for userId=${userId}:`, pushErr);
      }
    }

    const summary = { checked, sent, expired, skippedHour, skippedCompleted, utcHour };
    console.log(`[reminder] Done —`, JSON.stringify(summary));
    return json(summary);
  } catch (err) {
    console.error("[reminder] Unhandled error:", err);
    return json({ error: String(err) }, 500);
  }
});
