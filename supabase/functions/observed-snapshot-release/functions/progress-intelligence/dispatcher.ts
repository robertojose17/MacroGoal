export const PREVIEW_MODE = 'preview-program-v1';
export const previewHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Macrogoal-Preview',
  'X-Macrogoal-Preview': 'private-qa-v1',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
type Handler = (request: Request) => Promise<Response>;
export function createPreviewDispatcher(legacy: Handler, loadPreview: () => Promise<{ handlePreview: Handler }>) {
  return async (request: Request): Promise<Response> => {
    const modes = new URL(request.url).searchParams.getAll('mode');
    // All legacy selectors/methods retain the original handler and unchanged body.
    if (modes.length !== 1 || modes[0] !== PREVIEW_MODE) return legacy(request);
    if (request.method === 'OPTIONS') return new Response('ok', { headers: previewHeaders });
    try {
      // A preview dependency or initialization failure must not poison legacy startup.
      return await (await loadPreview()).handlePreview(request);
    } catch {
      return new Response(JSON.stringify({ error: 'preview_unavailable' }), { status: 503, headers: previewHeaders });
    }
  };
}
