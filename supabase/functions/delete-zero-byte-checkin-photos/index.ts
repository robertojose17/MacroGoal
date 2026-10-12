// Deliberately inert: no Supabase client, credentials, storage, signing or deletion.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204,headers});
  return new Response(JSON.stringify({error:'This photo endpoint is no longer available. Update the app.',code:'PHOTO_ENDPOINT_RETIRED'}), {status:410,headers});
});
