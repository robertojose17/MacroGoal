export type AppLanguage = 'en' | 'es';
type Session = { user: { id: string } } | null;
export interface LanguagePreferenceSyncOptions {
  getLanguage: () => string;
  subscribeLanguage: (listener: () => void) => () => void;
}
export interface LanguagePreferenceSyncDependencies {
  getSession: () => Promise<Session>;
  getUserId: () => Promise<string | null>;
  subscribeAuth: (listener: (session: Session) => void) => () => void;
  update: (id: string, language: AppLanguage, signal: AbortSignal) => Promise<boolean>;
  warn?: () => void;
}

// The Settings language on this installation is authoritative at sign-in.
// Updates never create users, change another profile field, or change UI language.
export function createLanguagePreferenceSync(
  options: LanguagePreferenceSyncOptions,
  dependencies: LanguagePreferenceSyncDependencies,
): () => void {
  let disposed = false;
  let owner: string | null = null;
  let generation = 0;
  let revision = 0;
  let running = false;
  let pending = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let authObserved = false;

  const schedule = () => {
    if (disposed || !owner) return;
    pending = true;
    revision++;
    if (timer !== null || running) return;
    // Auth callbacks must return synchronously; don't call Supabase auth in them.
    timer = setTimeout(() => { timer = null; void flush(); }, 0);
  };
  const flush = async () => {
    if (disposed || running) return;
    running = true;
    try {
      while (pending && !disposed && owner) {
        pending = false;
        const id = owner;
        const epoch = generation;
        const currentRevision = revision;
        const language = options.getLanguage();
        if (language !== 'en' && language !== 'es') continue;
        controller = new AbortController();
        try {
          const authenticatedId = await dependencies.getUserId();
          if (disposed || epoch !== generation || id !== owner || authenticatedId !== id) continue;
          // Skip a stale queued choice; the next iteration writes the latest value.
          if (currentRevision !== revision) continue;
          const success = await dependencies.update(id, language, controller.signal);
          if (!success && !disposed && epoch === generation) dependencies.warn?.();
        } catch {
          if (!disposed && epoch === generation) dependencies.warn?.();
        } finally {
          controller = null;
        }
      }
    } finally { running = false; }
  };
  const acceptSession = (session: Session) => {
    if (disposed) return;
    const nextOwner = session?.user.id ?? null;
    if (nextOwner !== owner) {
      generation++;
      controller?.abort();
      pending = false;
      owner = nextOwner;
    }
    schedule();
  };
  const unsubscribeAuth = dependencies.subscribeAuth((session) => {
    authObserved = true;
    acceptSession(session);
  });
  const unsubscribeLanguage = options.subscribeLanguage(schedule);
  // A late initial getSession must never overwrite a newer auth event.
  void dependencies.getSession().then((session) => {
    if (!authObserved) acceptSession(session);
  }).catch(() => { if (!disposed) dependencies.warn?.(); });

  return () => {
    disposed = true;
    generation++;
    pending = false;
    controller?.abort();
    if (timer !== null) clearTimeout(timer);
    unsubscribeAuth();
    unsubscribeLanguage();
  };
}
