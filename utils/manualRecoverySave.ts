type Payload = Record<string, string | number | boolean | null>;
type Services<P extends Payload, R extends P & {id: string}> = {
  insert(payload: P & {id: string}): Promise<{data: R | null; error?: unknown}>;
  read(id: string, owner: string): Promise<{data: R | null; error?: unknown}>;
};
function nonce() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
// A form-lifetime insertion identity, not an authorization token. Never upserts.
// A remount/restart creates a new attempt; no cross-session deduplication claim.
export function createManualRecoverySave<P extends Payload = Payload, R extends P & {id: string} = P & {id: string}>() {
  let bound: (P & {id: string}) | undefined;
  let pending: Promise<R> | undefined;
  let saved: R | undefined;
  const matches = (row: R | null) => !!row && !!bound &&
    Object.keys(bound).every(key => row[key] === bound![key]);
  return function save(owner: string, payload: P, services: Services<P, R>): Promise<R> {
    if (!owner || payload.created_by !== owner) return Promise.reject(Error('manual_owner_changed'));
    if (bound && bound.created_by !== owner) return Promise.reject(Error('manual_owner_changed'));
    if (bound && (Object.keys(payload).length !== Object.keys(bound).length - 1 ||
        Object.keys(payload).some(key => payload[key] !== bound![key]))) {
      return Promise.reject(Error('manual_payload_changed'));
    }
    if (!bound) bound = {...payload, id: nonce()};
    if (saved) return Promise.resolve(saved);
    if (pending) return pending;
    const attempt = bound;
    pending = (async () => {
      try {
        const result = await services.insert(attempt);
        if (!result.error && matches(result.data)) return saved = result.data!;
      } catch (error) {
        if(error instanceof Error && error.message==='manual_owner_changed')throw error;
        // The insert may have committed. Read this exact owned ID.
      }
      try {
        const result = await services.read(attempt.id, owner);
        if (!result.error && matches(result.data)) return saved = result.data!;
      } catch (error) {
        if(error instanceof Error && error.message==='manual_owner_changed')throw error;
        // Neither failure nor absence proves that insertion did not commit.
      }
      throw Error('manual_save_unknown');
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
