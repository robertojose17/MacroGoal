import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/**
 * Add (or subtract) days from a YYYY-MM-DD string using pure UTC arithmetic.
 * This avoids DST issues because we build the Date from explicit Y/M/D.
 */
function addDaysLocal(localDateStr: string, delta: number): string {
  const [y, m, d] = localDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/functions\/v1\/trackers/, "") || "/";
  if (path === "") path = "/";
  const method = req.method;
  const segments = path.split("/").filter(Boolean);

  try {
    // GET /trackers
    if (method === "GET" && segments.length === 0) {
      const { data: trackers, error } = await supabase
        .from("trackers")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) return json({ error: error.message }, 500);

      if (!trackers || trackers.length === 0) {
        const defaults = [
          { user_id: user.id, name: "weight", emoji: "⚖️", tracker_type: "numeric", unit: "lb", goal_value: null, frequency: "daily", is_default: true, sort_order: 0 },
          { user_id: user.id, name: "steps", emoji: "👟", tracker_type: "numeric", unit: "steps", goal_value: 10000, frequency: "daily", is_default: true, sort_order: 1 },
          { user_id: user.id, name: "gym", emoji: "🏋️", tracker_type: "binary", unit: null, goal_value: null, frequency: "daily", is_default: true, sort_order: 2 },
        ];
        const { data: created, error: createError } = await supabase
          .from("trackers")
          .insert(defaults)
          .select();
        if (createError) return json({ error: createError.message }, 500);
        return json(created);
      }

      return json(trackers);
    }

    // POST /trackers
    if (method === "POST" && segments.length === 0) {
      const body = await req.json();
      const { data, error } = await supabase
        .from("trackers")
        .insert({ ...body, user_id: user.id })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json(data, 201);
    }

    const trackerId = segments[0];

    // PUT /trackers/:id
    if (method === "PUT" && segments.length === 1) {
      const body = await req.json();
      const { data, error } = await supabase
        .from("trackers")
        .update(body)
        .eq("id", trackerId)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // DELETE /trackers/:id
    if (method === "DELETE" && segments.length === 1) {
      const { error } = await supabase
        .from("trackers")
        .delete()
        .eq("id", trackerId)
        .eq("user_id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // GET /trackers/:id/stats
    if (method === "GET" && segments.length === 2 && segments[1] === "stats") {
      const now = new Date();

      // ── Fetch user timezone ────────────────────────────────────────────────
      const { data: userRow } = await supabase
        .from("users")
        .select("timezone")
        .eq("id", user.id)
        .maybeSingle();
      const userTz = (userRow?.timezone as string) || "UTC";

      // ── Compute local today and 30-days-ago in user's timezone ───────────
      const today = getLocalDateString(userTz, now);
      const thirtyDaysAgoStr = addDaysLocal(today, -30);

      const { data: entries, error } = await supabase
        .from("tracker_entries")
        .select("date, value")
        .eq("tracker_id", trackerId)
        .eq("user_id", user.id)
        .gte("date", thirtyDaysAgoStr)
        .order("date", { ascending: false });

      if (error) return json({ error: error.message }, 500);

      const { data: tracker } = await supabase
        .from("trackers")
        .select("goal_value")
        .eq("id", trackerId)
        .single();

      const entryDates = new Set((entries || []).map((e: { date: string }) => e.date));
      const daysTracked = entryDates.size;

      // ── Streak: walk backwards from today (or yesterday) in user-local dates ─
      let streak = 0;
      const yesterdayStr = addDaysLocal(today, -1);

      // Start from today if logged, else yesterday if logged, else no streak
      let checkDateStr: string | null = entryDates.has(today)
        ? today
        : entryDates.has(yesterdayStr)
        ? yesterdayStr
        : null;

      if (checkDateStr) {
        while (true) {
          if (entryDates.has(checkDateStr)) {
            streak++;
            checkDateStr = addDaysLocal(checkDateStr, -1);
          } else {
            break;
          }
        }
      }

      let daysGoalMet = 0;
      if (tracker?.goal_value != null) {
        daysGoalMet = (entries || []).filter((e: { value: number }) => e.value >= tracker.goal_value).length;
      }

      // ── Week boundaries in user's local timezone ─────────────────────────
      // Parse localToday as a UTC-midnight Date so getUTCDay() gives the
      // correct weekday for the user's local calendar date.
      const [ty, tm, td] = today.split("-").map(Number);
      const localTodayDate = new Date(Date.UTC(ty, tm - 1, td));
      const dayOfWeek = localTodayDate.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMondayStr = addDaysLocal(today, mondayOffset);
      const lastMondayStr = addDaysLocal(thisMondayStr, -7);
      const lastSundayStr = addDaysLocal(thisMondayStr, -1);

      const thisWeekCount = (entries || []).filter((e: { date: string }) => e.date >= thisMondayStr).length;
      const lastWeekCount = (entries || []).filter((e: { date: string }) => e.date >= lastMondayStr && e.date <= lastSundayStr).length;

      const avgValue = daysTracked > 0
        ? (entries || []).reduce((sum: number, e: { value: number }) => sum + e.value, 0) / daysTracked
        : null;

      let status = "no_data";
      if (daysTracked > 0) {
        status = streak > 0 || thisWeekCount > 0 ? "on_track" : "off_track";
      }

      return json({
        current_streak: streak,
        best_streak: streak,
        completion_rate: daysTracked / 30,
        days_tracked: daysTracked,
        days_goal_met: daysGoalMet,
        this_week_count: thisWeekCount,
        last_week_count: lastWeekCount,
        total_entries: daysTracked,
        avg_value: avgValue,
        status,
      });
    }

    // GET /trackers/:id/entries
    if (method === "GET" && segments.length === 2 && segments[1] === "entries") {
      const limit = parseInt(url.searchParams.get("limit") || "30");
      const { data, error } = await supabase
        .from("tracker_entries")
        .select("*")
        .eq("tracker_id", trackerId)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // POST /trackers/:id/entries
    if (method === "POST" && segments.length === 2 && segments[1] === "entries") {
      const body = await req.json();
      const { data, error } = await supabase
        .from("tracker_entries")
        .upsert(
          { tracker_id: trackerId, user_id: user.id, date: body.date, value: body.value, notes: body.notes ?? null },
          { onConflict: "tracker_id,date" }
        )
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json(data, 201);
    }

    // PUT /trackers/:id/entries/:entryId
    if (method === "PUT" && segments.length === 3 && segments[1] === "entries") {
      const entryId = segments[2];
      const body = await req.json();
      const { data, error } = await supabase
        .from("tracker_entries")
        .update({ value: body.value, notes: body.notes })
        .eq("id", entryId)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // DELETE /trackers/:id/entries/:entryId
    if (method === "DELETE" && segments.length === 3 && segments[1] === "entries") {
      const entryId = segments[2];
      const { error } = await supabase
        .from("tracker_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
