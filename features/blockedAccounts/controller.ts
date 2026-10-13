import { scopeKey, type BlockedAccount, type BlockedSession, type BlockedTransport } from './contracts';
export interface BlockedSnapshot {
  scopeKey: string | null; items: BlockedAccount[]; status: 'idle' | 'loading' | 'ready' | 'error' | 'saving';
  cursor: string | null; hasMore: boolean; confirmation: (BlockedAccount & { confirmationKey: string }) | null; notice: 'success' | 'uncertain' | null;
}
export const emptyBlockedSnapshot = (): BlockedSnapshot => ({ scopeKey: null, items: [], status: 'idle', cursor: null, hasMore: false, confirmation: null, notice: null });
export function createBlockedController(transport: BlockedTransport, isCurrent: (session: BlockedSession) => boolean) {
  let session: BlockedSession | null = null, version = 0, confirmationSerial = 0, request: AbortController | null = null;
  let snapshot = emptyBlockedSnapshot();
  const listeners = new Set<() => void>();
  const emit = (next: BlockedSnapshot) => { snapshot = next; listeners.forEach(fn => fn()); };
  const current = (mine: number, captured: BlockedSession) => mine === version && !!session && scopeKey(session) === scopeKey(captured) && isCurrent(captured);
  function setSession(next: BlockedSession | null) {
    if (next && session && scopeKey(next) === scopeKey(session)) return;
    version++; request?.abort(); request = null; session = next ? { ...next } : null;
    emit({ ...emptyBlockedSnapshot(), scopeKey: next ? scopeKey(next) : null });
  }
  async function load(more = false, preserveNotice = false) {
    if (!session || !isCurrent(session) || snapshot.status === 'saving' || snapshot.status === 'loading' || more && (!snapshot.hasMore || !snapshot.cursor)) return;
    const captured = { ...session }, cursor = more ? snapshot.cursor : null;
    const previous = more ? snapshot.items : [];
    const mine = ++version; request?.abort(); request = new AbortController();
    emit({ ...snapshot, items: previous, status: 'loading', confirmation: null, notice: preserveNotice ? snapshot.notice : null });
    let result;
    try { result = await transport.list({ session: captured, cursor, signal: request.signal }); } catch { result = { ok: false as const }; }
    if (!current(mine, captured)) return;
    if (!result.ok) { emit({ ...snapshot, status: 'error' }); return; }
    emit({ ...snapshot, items: [...previous, ...result.value.items], status: 'ready', cursor: result.value.nextCursor, hasMore: result.value.hasMore });
  }
  function ask(userId: string) {
    if (!session || !isCurrent(session) || snapshot.status !== 'ready') return;
    const row = snapshot.items.find(item => item.userId === userId);
    if (row) emit({ ...snapshot, confirmation: { ...row, confirmationKey: `${scopeKey(session)}:${++confirmationSerial}:${row.userId}` }, notice: null });
  }
  function cancel() { if (snapshot.status !== 'saving') emit({ ...snapshot, confirmation: null }); }
  async function confirm(confirmationKey: string) {
    if (!session || !isCurrent(session) || snapshot.status !== 'ready' || !snapshot.confirmation || snapshot.confirmation.confirmationKey !== confirmationKey) return;
    const captured = { ...session }, targetUserId = snapshot.confirmation.userId;
    if (!snapshot.items.some(item => item.userId === targetUserId)) return;
    const mine = ++version; request?.abort(); request = new AbortController();
    emit({ ...snapshot, status: 'saving' });
    let result;
    try { result = await transport.unblock({ session: captured, targetUserId, signal: request.signal }); } catch { result = { ok: false as const }; }
    if (!current(mine, captured)) return;
    // An ambiguous transport outcome never becomes an optimistic successful unblock.
    emit({ ...snapshot, status: 'ready', confirmation: null, notice: result.ok ? 'success' : 'uncertain' });
    await load(false, true);
  }
  return { setSession, load, ask, cancel, confirm, getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } };
}
