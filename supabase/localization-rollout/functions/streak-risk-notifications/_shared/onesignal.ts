import { createClient } from "npm:@supabase/supabase-js@2";

export interface OneSignalNotificationPayload {
  userIds: string[];
  heading: string;
  content: string;
  data?: Record<string, unknown>;
  headings_es?: string;
  contents_es?: string;
}

async function sendSelectedNotification(
  payload: OneSignalNotificationPayload
): Promise<unknown> {
  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!appId || !restApiKey) {
    console.error("[onesignal] ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY not set — skipping notification");
    return null;
  }

  const body = {
    app_id: appId,
    include_aliases: { external_id: payload.userIds },
    target_channel: "push",
    headings: {
      en: payload.heading,
      es: payload.headings_es ?? payload.heading,
    },
    contents: {
      en: payload.content,
      es: payload.contents_es ?? payload.content,
    },
    ...(payload.data ? { data: payload.data } : {}),
  };

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Key ${restApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const responseJson = await res.json();

    if (!res.ok) {
      console.error("[onesignal] API error:", res.status, JSON.stringify(responseJson));
      return responseJson;
    }

    return responseJson;
  } catch (err) {
    console.error("[onesignal] Fetch error:", err);
    return null;
  }
}


// Null/unknown preferences keep the existing OneSignal device-locale behavior.
// Explicit Settings choices override both provider locale fields, so device locale
// cannot override the app preference. Recipient eligibility and schedules are unchanged.
export async function sendOneSignalNotification(
  payload: OneSignalNotificationPayload
): Promise<unknown> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const results: unknown[] = [];
  for (let start = 0; start < payload.userIds.length; start += 100) {
    const ids = payload.userIds.slice(start, start + 100);
    const { data, error } = await admin.from("users")
      .select("id, preferred_language").in("id", ids);
    if (error) {
      // Preserve delivery for legacy clients or temporary preference-read failures.
      console.warn("[onesignal] Language lookup failed; using existing locale fallback");
      results.push(await sendSelectedNotification({ ...payload, userIds: ids }));
      continue;
    }
    const languages = new Map((data ?? []).map((row) => [row.id, row.preferred_language]));
    for (const language of ["en", "es", null]) {
      const userIds = ids.filter((id) => {
        const value = languages.get(id);
        return (value === "en" || value === "es" ? value : null) === language;
      });
      if (userIds.length === 0) continue;
      if (language === null) {
        results.push(await sendSelectedNotification({ ...payload, userIds }));
      } else {
        const heading = language === "es" ? payload.headings_es ?? payload.heading : payload.heading;
        const content = language === "es" ? payload.contents_es ?? payload.content : payload.content;
        results.push(await sendSelectedNotification({
          ...payload, userIds, heading, content, headings_es: heading, contents_es: content,
        }));
      }
    }
  }
  return results;
}
