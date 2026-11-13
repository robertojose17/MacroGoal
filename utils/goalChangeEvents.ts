type Listener = (userId: string | undefined) => void;
const listeners = new Set<Listener>();
export function subscribeGoalChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function emitGoalChanged(userId?: string): void {
  for (const listener of [...listeners]) { try { listener(userId); } catch { /* Independent consumers must still invalidate. */ } }
}
