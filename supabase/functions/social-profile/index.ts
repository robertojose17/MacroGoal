// source/server/profileContracts.ts
var MAX_NUTRITION_DAYS = 366;

// source/server/profilePrivacy.ts
var PROFILE_SELECT = Object.freeze({
  user_discovery: "id,username,name,full_name,avatar_url",
  user_profile: "id,username,name,full_name,avatar_url,bio",
  social_bio: "user_id,bio",
  nutrient_goals: "daily_calories,protein_g,carbs_g,fats_g,fiber_g"
});
function projectPublicAvatarUrl(value, locations) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const path = decodeURIComponent(url.pathname);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[%\\]/.test(path) || /(?:^|\/)(?:private|check[-_]?ins?|check[-_]?in[-_]?photos|gallery)(?:\/|$)/i.test(path)) return null;
    return locations.some((location) => location.origin === url.origin && location.path_prefix.startsWith("/") && location.path_prefix.endsWith("/") && location.path_prefix.length > 1 && path.startsWith(location.path_prefix)) ? url.href : null;
  } catch {
    return null;
  }
}

// source/server/profileSnapshotHttp.ts
var MAX_PROFILE_HTTP_RESPONSE_BYTES = 1024 * 1024;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var QUERY_KEYS = ["response_version", "user_id", "from_date", "to_date", "today"];
var DAY_MS = 864e5;
function dateMs(value) {
  if (!value || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}
function parseProfileSnapshotRequest(url) {
  if (url.href.length > 4096) return null;
  for (const key of url.searchParams.keys()) if (!QUERY_KEYS.includes(key)) return null;
  if (!QUERY_KEYS.every((key) => url.searchParams.getAll(key).length === 1)) return null;
  const q = url.searchParams;
  const target = q.get("user_id");
  const from = dateMs(q.get("from_date")), to = dateMs(q.get("to_date"));
  if (q.get("response_version") !== "2" || !UUID.test(target) || from === null || to === null || to < from || (to - from) / DAY_MS + 1 > MAX_NUTRITION_DAYS || dateMs(q.get("today")) === null) return null;
  if (dateMs(q.get("today")) < Date.parse("0001-01-30T00:00:00.000Z")) return null;
  return { targetId: target.toLowerCase(), fromDate: q.get("from_date"), toDate: q.get("to_date"), today: q.get("today") };
}
function rpcErrorStatus(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return code === "28000" || code === "PGRST301" ? 401 : code === "42501" ? 404 : 503;
}
function createProfileHttpHandler(deps) {
  const timeoutMs = deps.timeoutMs ?? 1e4;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3e4) throw new TypeError("Invalid HTTP timeout");
  const allowedOrigins = new Set(deps.allowedOrigins ?? []);
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) throw new TypeError("Invalid allowed origin");
  }
  return async function handleProfile(request) {
    const origin = request.headers.get("origin");
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      Vary: "Authorization, Origin"
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    const unavailable2 = (status = 503) => reply(status, { error: status === 401 ? "authentication_required" : "profile_unavailable" });
    if (origin && !allowedOrigins.has(origin)) return unavailable2(403);
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS") {
      const method = request.headers.get("access-control-request-method");
      const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").toLowerCase().split(",").map((h) => h.trim()).filter(Boolean);
      if (!origin || method !== "GET" || requestedHeaders.some((h) => !["authorization", "apikey", "x-client-info", "accept", "content-type"].includes(h))) return unavailable2(403);
      return new Response(null, { status: 204, headers: {
        ...headers,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, accept, content-type"
      } });
    }
    if (request.method !== "GET") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: { ...headers, Allow: "GET, OPTIONS" } });
    const authorization = request.headers.get("authorization");
    if (!authorization || authorization.length > 8192 || !/^Bearer [A-Za-z0-9._~-]+$/i.test(authorization)) return unavailable2(401);
    const token = authorization.slice(7);
    let input;
    try {
      input = parseProfileSnapshotRequest(new URL(request.url));
    } catch {
      input = null;
    }
    if (!input) return reply(400, { error: "invalid_request" });
    if (request.signal.aborted) return unavailable2();
    const controller = new AbortController();
    const onRequestAbort = () => controller.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let onAbort = () => {
    };
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new Error("unavailable"));
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const client = deps.createUserClient(token);
      const auth = await Promise.race([client.auth.getUser(token, controller.signal), aborted]);
      if (controller.signal.aborted) return unavailable2();
      const user = auth.data?.user;
      if (auth.error || !user || user.is_anonymous !== false || typeof user.id !== "string" || !UUID.test(user.id)) return unavailable2(401);
      const callerId = user.id.toLowerCase();
      const result = await Promise.race([client.rpc("profile_snapshot", {
        p_target: input.targetId,
        p_from: input.fromDate,
        p_to: input.toDate,
        p_today: input.today
      }, controller.signal), aborted]);
      if (controller.signal.aborted) return unavailable2();
      if (result.error) return unavailable2(rpcErrorStatus(result.error));
      const value = deps.validateSnapshot(result.data, input, callerId);
      if (controller.signal.aborted || !value || value.target_user_id !== input.targetId || value.is_own_profile !== (callerId === input.targetId)) return unavailable2(502);
      const body = JSON.stringify({
        ...value,
        discovery: value.discovery === null ? null : { ...value.discovery, avatar_url: projectPublicAvatarUrl(value.discovery.avatar_url, deps.publicAvatarLocations) },
        user: value.user === null ? null : { ...value.user, avatar_url: projectPublicAvatarUrl(value.user.avatar_url, deps.publicAvatarLocations) }
      });
      if (new TextEncoder().encode(body).byteLength > MAX_PROFILE_HTTP_RESPONSE_BYTES) return unavailable2(502);
      return new Response(body, { status: 200, headers });
    } catch {
      return unavailable2();
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", onRequestAbort);
      controller.signal.removeEventListener("abort", onAbort);
    }
  };
}

// source/client/responseValidation.ts
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var nutrients = ["calories", "protein", "carbs", "fats", "fiber"];
var unavailable = /* @__PURE__ */ new Set([
  "authentication_required",
  "invalid_target",
  "profile_unavailable",
  "authorization_unavailable",
  "approval_required",
  "approval_pending",
  "follow_required",
  "nutrition_unavailable"
]);
var DAY_MS2 = 864e5;
function object(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function keys(v, names) {
  return object(v) && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
}
function isId(v) {
  return typeof v === "string" && UUID2.test(v);
}
function nullableString(v, max) {
  return v === null || typeof v === "string" && v.length <= max;
}
function booleanOrNull(v) {
  return v === null || typeof v === "boolean";
}
function amount(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function dateMs2(v) {
  if (typeof v !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v ? ms : null;
}
function sameNumber(a, b) {
  return Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
}
function identity(v) {
  return keys(v, ["id", "username", "name", "full_name", "avatar_url", "bio", "is_premium"]) && isId(v.id) && nullableString(v.username, 100) && nullableString(v.name, 200) && nullableString(v.full_name, 200) && nullableString(v.avatar_url, 2048) && nullableString(v.bio, 4e3) && booleanOrNull(v.is_premium);
}
function discoveryIdentity(v) {
  return keys(v, ["id", "username", "name", "full_name", "avatar_url"]) && isId(v.id) && nullableString(v.username, 100) && nullableString(v.name, 200) && nullableString(v.full_name, 200) && nullableString(v.avatar_url, 2048);
}
function amounts(v, nullable = false) {
  return keys(v, nutrients) && nutrients.every((k) => amount(v[k]) || nullable && v[k] === null);
}
function nutrition(v, input) {
  if (!keys(v, [
    "from_date",
    "to_date",
    "day_count",
    "date_basis",
    "calendar_basis",
    "goals_scope",
    "current_goals",
    "totals",
    "daily_average",
    "days",
    "days_tracked",
    "units"
  ])) return false;
  const from = dateMs2(input.fromDate), to = dateMs2(input.toDate);
  const dayCount = (to - from) / DAY_MS2 + 1;
  const units = v.units;
  if (v.from_date !== input.fromDate || v.to_date !== input.toDate || v.day_count !== dayCount || v.date_basis !== "meal_date" || v.calendar_basis !== "request_calendar_dates" || v.goals_scope !== "current" || !(v.current_goals === null || amounts(v.current_goals, true)) || !amounts(v.totals) || !amounts(v.daily_average) || !Array.isArray(v.days) || v.days.length !== dayCount || !Number.isInteger(v.days_tracked) || !keys(units, nutrients) || units.calories !== "kcal" || nutrients.slice(1).some((k) => units[k] !== "g")) return false;
  const sums = Object.fromEntries(nutrients.map((k) => [k, 0]));
  let tracked = 0;
  for (let i = 0; i < v.days.length; i += 1) {
    const day = v.days[i];
    if (!keys(day, ["date", ...nutrients, "has_logged_items"]) || dateMs2(day.date) !== from + i * DAY_MS2 || typeof day.has_logged_items !== "boolean" || !nutrients.every((k) => amount(day[k]))) return false;
    if (!day.has_logged_items && nutrients.some((k) => day[k] !== 0)) return false;
    if (day.has_logged_items) tracked += 1;
    for (const k of nutrients) sums[k] += day[k];
  }
  const totals = v.totals, averages = v.daily_average;
  return tracked === v.days_tracked && nutrients.every((k) => amount(sums[k]) && sameNumber(totals[k], sums[k]) && sameNumber(averages[k], sums[k] / dayCount));
}
function nonnegativeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function countMetric(value) {
  return keys(value, ["status"]) && value.status === "unavailable" || keys(value, ["status", "value"]) && value.status === "available" && nonnegativeInteger(value.value);
}
function metrics(value, today) {
  if (!keys(value, ["streak", "member_since", "consistency", "followers_count", "following_count", "posts_count"])) return false;
  const streak = value.streak, member = value.member_since, consistency = value.consistency;
  if (!(keys(streak, ["status"]) && streak.status === "unavailable" || keys(streak, ["status", "current", "best"]) && streak.status === "available" && nonnegativeInteger(streak.current) && nonnegativeInteger(streak.best) && streak.best >= streak.current)) return false;
  if (!(keys(member, ["status"]) && member.status === "unavailable" || keys(member, ["status", "month", "calendar_basis"]) && member.status === "available" && typeof member.month === "string" && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(member.month) && member.calendar_basis === "UTC")) return false;
  if (!(keys(consistency, ["status"]) && ["hidden", "unavailable"].includes(consistency.status) || keys(consistency, ["status", "score", "from_date", "to_date", "day_count"]) && consistency.status === "available" && nonnegativeInteger(consistency.score) && consistency.score <= 100 && consistency.day_count === 30 && consistency.to_date === today && dateMs2(consistency.from_date) === dateMs2(today) - 29 * DAY_MS2)) return false;
  return countMetric(value.followers_count) && countMetric(value.following_count) && countMetric(value.posts_count);
}
function followRequestDescriptor(value, state, own, discoverable) {
  if (own) return value === null && state === null;
  if (!discoverable || state === null) return value === null;
  if (value === null) return state === "none";
  if (!keys(value, ["request_id", "revision", "state"]) || !isId(value.request_id) || typeof value.revision !== "string" || !/^[1-9]\d{0,18}$/.test(value.revision) || BigInt(value.revision) > 9223372036854775807n || !["pending", "accepted", "rejected", "cancelled", "revoked"].includes(value.state)) return false;
  return value.state === state || state === "none" && ["rejected", "cancelled", "revoked"].includes(value.state);
}
function parseProfileResponse(body, input, callerId) {
  if (!keys(body, [
    "response_version",
    "target_user_id",
    "user",
    "is_own_profile",
    "is_following",
    "is_mutual",
    "can_discover_profile",
    "discovery",
    "follow_request_state",
    "follow_request",
    "is_accepted_follower",
    "can_view_profile",
    "can_view_nutrition",
    "nutrition_unavailable_reason",
    "nutrition",
    "metrics"
  ])) return null;
  if (body.response_version !== 2 || body.target_user_id !== input.userId || body.is_own_profile !== (callerId === input.userId) || !booleanOrNull(body.is_following) || !booleanOrNull(body.is_mutual) || typeof body.can_view_profile !== "boolean" || typeof body.can_view_nutrition !== "boolean" || typeof body.can_discover_profile !== "boolean" || !booleanOrNull(body.is_accepted_follower) || !(body.follow_request_state === null || ["none", "pending", "accepted"].includes(body.follow_request_state)) || body.is_mutual === true && body.is_following !== true) return null;
  if (!followRequestDescriptor(body.follow_request, body.follow_request_state, body.is_own_profile, body.can_discover_profile)) return null;
  const acceptedActive = body.follow_request_state === "accepted" && body.is_accepted_follower === true && body.is_following === true;
  if (body.is_accepted_follower === true && !acceptedActive) return null;
  if (body.can_discover_profile) {
    if (!discoveryIdentity(body.discovery) || body.discovery.id.toLowerCase() !== input.userId) return null;
  } else if (body.discovery !== null || body.can_view_profile || body.can_view_nutrition || body.is_following !== null || body.is_mutual !== null || body.follow_request_state !== null || body.is_accepted_follower !== null) return null;
  if (body.can_view_profile) {
    if (!body.can_discover_profile || !body.is_own_profile && !acceptedActive) return null;
    if (!identity(body.user) || body.user.id.toLowerCase() !== input.userId) return null;
    if (body.metrics !== null && !metrics(body.metrics, input.today)) return null;
  } else if (body.user !== null || body.can_view_nutrition || body.metrics !== null) return null;
  if (body.can_view_nutrition) {
    if (!body.can_view_profile || body.nutrition_unavailable_reason !== null || !body.is_own_profile && !acceptedActive || !nutrition(body.nutrition, input)) return null;
  } else if (body.nutrition !== null || typeof body.nutrition_unavailable_reason !== "string" || !unavailable.has(body.nutrition_unavailable_reason)) return null;
  return body;
}

// source/server/sdk-binding/supabaseProfileBinding.ts
var UUID3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var MAX_UPSTREAM_BYTES = 1024 * 1024;
function isPublicKey(value) {
  if (typeof value !== "string" || value.length > 8192 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload !== null && typeof payload === "object" && payload.role === "anon";
  } catch {
    return false;
  }
}
function genericError(code = "P0001") {
  return { code };
}
function unavailableResponse(status = 503) {
  return new Response(JSON.stringify({ code: status === 401 ? "PGRST301" : status === 403 ? "42501" : "P0001", message: "Request unavailable" }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
async function boundedJson(response, signal) {
  const announced = response.headers.get("content-length");
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > MAX_UPSTREAM_BYTES) || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "") || !response.body) {
    void response.body?.cancel().catch(() => {
    });
    return null;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => {
    });
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!signal.aborted) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_UPSTREAM_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
    if (signal.aborted) return null;
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return bytes;
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
async function createSupabaseProfileUserClientFactory(config) {
  let origin;
  try {
    const url = new URL(config.projectUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" && url.pathname !== "" || !isPublicKey(config.publicKey) || typeof config.fetch !== "function") throw new Error();
    origin = url.origin;
  } catch {
    throw new TypeError("Invalid public project configuration");
  }
  const publicKey = config.publicKey;
  const transport = config.fetch;
  const { createClient } = await import("npm:@supabase/supabase-js@2.83.0");
  return (token) => {
    if (typeof token !== "string" || token.length < 1 || token.length > 8192 || !/^[A-Za-z0-9._~-]+$/.test(token)) throw new TypeError("Invalid request authentication");
    let operation = null;
    let authUsed = false;
    let verified = false;
    let rpcUsed = false;
    const guardedFetch = async (input, init) => {
      const active = operation;
      if (!active || active.signal.aborted) return unavailableResponse();
      try {
        const inputRequest = input instanceof Request ? input : null;
        const url = new URL(inputRequest?.url ?? String(input));
        const method = (init?.method ?? inputRequest?.method ?? "GET").toUpperCase();
        const headers = new Headers(init?.headers ?? inputRequest?.headers);
        const path = active.kind === "auth" ? "/auth/v1/user" : "/rest/v1/rpc/profile_snapshot";
        if (url.origin !== origin || url.pathname !== path || url.search || url.hash || method !== (active.kind === "auth" ? "GET" : "POST") || headers.get("authorization") !== `Bearer ${token}` || headers.get("apikey") !== publicKey) return unavailableResponse();
        const response = await transport(input, { ...init, headers, signal: active.signal, redirect: "error", credentials: "omit", cache: "no-store" });
        if (active.signal.aborted || response.redirected || response.url && new URL(response.url).origin !== origin) {
          void response.body?.cancel().catch(() => {
          });
          return unavailableResponse();
        }
        if (!response.ok || response.status !== 200) {
          void response.body?.cancel().catch(() => {
          });
          return unavailableResponse(response.status === 401 ? 401 : response.status === 403 ? 403 : 503);
        }
        const bytes = await boundedJson(response, active.signal);
        return bytes === null ? unavailableResponse() : new Response(bytes, { status: 200, headers: { "Content-Type": "application/json" } });
      } catch {
        return unavailableResponse();
      }
    };
    const sdk = createClient(origin, publicKey, {
      db: { schema: "public" },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, debug: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: guardedFetch }
    });
    return {
      auth: {
        async getUser(requestToken, signal) {
          if (authUsed || operation || signal.aborted || requestToken !== token) return { data: { user: null }, error: genericError("28000") };
          authUsed = true;
          operation = { kind: "auth", signal };
          try {
            const result = await sdk.auth.getUser(token);
            const user = result.data.user;
            if (signal.aborted || result.error || !user || user.is_anonymous !== false || !UUID3.test(user.id)) {
              return { data: { user: null }, error: genericError("28000") };
            }
            verified = true;
            return { data: { user: { id: user.id.toLowerCase(), is_anonymous: false } }, error: null };
          } catch {
            return { data: { user: null }, error: genericError("28000") };
          } finally {
            operation = null;
          }
        }
      },
      async rpc(name, args, signal) {
        if (!verified || rpcUsed || operation || signal.aborted || name !== "profile_snapshot") return { data: null, error: genericError() };
        rpcUsed = true;
        operation = { kind: "rpc", signal };
        try {
          const result = await sdk.rpc("profile_snapshot", args).abortSignal(signal);
          if (signal.aborted) return { data: null, error: genericError() };
          if (result.error) {
            const code = result.error.code;
            return { data: null, error: genericError(["28000", "42501", "PGRST301"].includes(code) ? code : "P0001") };
          }
          return { data: result.data, error: null };
        } catch {
          return { data: null, error: genericError() };
        } finally {
          operation = null;
        }
      }
    };
  };
}
async function createSupabaseProfileHandler(config) {
  const createUserClient = await createSupabaseProfileUserClientFactory(config);
  return createProfileHttpHandler({
    createUserClient,
    validateSnapshot: (body, request, callerId) => parseProfileResponse(body, {
      userId: request.targetId,
      fromDate: request.fromDate,
      toDate: request.toDate,
      today: request.today
    }, callerId),
    publicAvatarLocations: config.publicAvatarLocations,
    allowedOrigins: config.allowedOrigins,
    timeoutMs: config.timeoutMs
  });
}

// source/server/communityProfileBootstrap.ts
async function startCommunityProfileEndpoint(runtime, fetch) {
  const projectUrl = runtime.env.get("SUPABASE_URL") ?? "";
  const publicKey = runtime.env.get("SUPABASE_ANON_KEY") ?? "";
  const handler = await createSupabaseProfileHandler({
    projectUrl,
    publicKey,
    fetch,
    allowedOrigins: [],
    publicAvatarLocations: [{ origin: new URL(projectUrl).origin, path_prefix: "/storage/v1/object/public/avatars/" }],
    timeoutMs: 1e4
  });
  return runtime.serve(handler);
}

// source/index.ts
await startCommunityProfileEndpoint(Deno, globalThis.fetch);
