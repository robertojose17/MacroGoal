export const observationHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Macrogoal-Observation',
  'X-Macrogoal-Observation': 'observation-v1',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
type Handler = (request: Request) => Promise<Response>;
export function createObservationDispatcher(existing: Handler, load: () => Promise<{handleObservation: Handler}>) {
  return async (request: Request): Promise<Response> => {
    const modes = new URL(request.url).searchParams.getAll('mode');
    if (!modes.includes('observed-program-v1')) return existing(request);
    if (modes.length !== 1) return new Response(JSON.stringify({error:'invalid_request'}), {status:400, headers:observationHeaders});
    if (request.method === 'OPTIONS') return new Response('ok', {headers:observationHeaders});
    try { return await (await load()).handleObservation(request); }
    catch { return new Response(JSON.stringify({error:'observation_unavailable'}), {status:503, headers:observationHeaders}); }
  };
}
