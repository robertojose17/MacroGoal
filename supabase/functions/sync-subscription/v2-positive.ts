import { createRCV2Reader } from '../common-premium-authority/rc-v2-adapter.mjs';
import { evaluateV2Evidence } from '../common-premium-authority/v2-evidence.mjs';
export async function readV2Active(owner: string, key: string, request = fetch, now = Date.now): Promise<boolean> {
  if (!key.trim()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const read = createRCV2Reader({
      projectId: 'proj0d801cfa', now, maxPages: 5, maxRequests: 30,
      getJSON: async (url: string) => {
        const response = await request(url, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        });
        return { status: response.status, body: response.status === 200 ? await response.json() : null };
      },
    });
    const observation = await read({ actor: owner, environment: 'PRODUCTION' });
    const check = evaluateV2Evidence(observation, owner, 'PRODUCTION', now());
    return !controller.signal.aborted && check.state === 'active' &&
      observation.scopeComplete === true && Number.isFinite(observation.providerValidUntil) &&
      observation.providerValidUntil > now();
  } catch {
    return false;
  } finally { clearTimeout(timer); }
}
