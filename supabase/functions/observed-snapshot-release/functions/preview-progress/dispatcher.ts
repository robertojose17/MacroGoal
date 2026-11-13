type Handler = (request: Request) => Promise<Response>;
export const progressHeaders = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'X-Macrogoal-Preview': 'private-progress-v1', 'Access-Control-Expose-Headers': 'X-Macrogoal-Preview',
};
export function createProgressDispatcher(v10: Handler, load: () => Promise<{ handlePreviewProgress: Handler }>): Handler {
  return async request => {
    const url = new URL(request.url), modes = url.searchParams.getAll('mode');
    if (modes.length !== 1 || modes[0] !== 'preview-progress-v1') return v10(request);
    if ([...url.searchParams.keys()].some(key => key !== 'mode'))
      return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers: progressHeaders });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: progressHeaders });
    try { return await (await load()).handlePreviewProgress(request); }
    catch { return new Response(JSON.stringify({ error: 'preview_unavailable' }), { status: 503, headers: progressHeaders }); }
  };
}
