/** Source-only global cutover proposal. No listener, network, token or database access. */
export const RETIREMENT_ENDPOINTS = [
  'social-profile', 'social-follows', 'social-feed', 'social-search-users',
  'social-user-stats', 'social-connections', 'social-post-actions',
] as const;
export type RetirementEndpoint = typeof RETIREMENT_ENDPOINTS[number];
const METHODS = ['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'HEAD'] as const;
const HEADERS = ['authorization', 'apikey', 'x-client-info', 'accept', 'content-type'];
export const APP_UPDATE_REQUIRED_MESSAGE = 'Actualiza MacroGoal para continuar. Esta versión ya no admite las nuevas opciones de privacidad.';

/** Bind only after the selected endpoint's replacement and release gates are satisfied.
 * community-profile is deliberately absent: it remains the new strict user-scoped API.
 * social-profile retirement requires verifying that new clients use community-profile.
 */
export function createLegacyEndpointRetirement(
  endpoint: RetirementEndpoint,
  allowedOrigins: readonly string[] = [],
): (request: Request) => Promise<Response> {
  if (!(RETIREMENT_ENDPOINTS as readonly string[]).includes(endpoint)) throw new TypeError('Unreviewed endpoint');
  const origins = new Set(allowedOrigins);
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) throw new TypeError('Invalid allowed origin');
  }
  return async function retired(request: Request): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store', Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff', Vary: 'Authorization, Origin',
    };
    const reply = (status: number, error: string, message?: string) => new Response(
      request.method === 'HEAD' ? null : JSON.stringify({ error, ...(message ? { message } : {}) }),
      { status, headers },
    );
    const origin = request.headers.get('origin');
    if (origin && !origins.has(origin)) return reply(403, 'request_unavailable');
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      const method = request.headers.get('access-control-request-method');
      const requested = (request.headers.get('access-control-request-headers') ?? '')
        .toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      if (!origin || !(METHODS as readonly string[]).includes(method ?? '') || requested.some(h => !HEADERS.includes(h))) {
        return reply(403, 'request_unavailable');
      }
      return new Response(null, { status: 204, headers: {
        ...headers, 'Access-Control-Allow-Methods': [...METHODS, 'OPTIONS'].join(', '),
        'Access-Control-Allow-Headers': HEADERS.join(', '),
      } });
    }
    // Do not read bearer/body, create a client, emulate an action, or fall back.
    return reply(410, 'app_update_required', APP_UPDATE_REQUIRED_MESSAGE);
  };
}

// Edge runtime bootstrap. The reviewed factory above stays byte-identical and inert.
// Native-only configuration: every browser Origin/preflight is refused.
export const handler = createLegacyEndpointRetirement('social-connections', []);
Deno.serve(handler);
