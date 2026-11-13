import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { createNutritionGoalSaveController } from './saveNutritionGoal';
import { createJourneyRestartController } from './restartNutritionJourney';
import { createSecureGoalRequestJournal } from './secureGoalRequestJournal';

export type AcceptedGoalSession = {
  save: ReturnType<typeof createNutritionGoalSaveController>;
  restart: ReturnType<typeof createJourneyRestartController>;
  listeners: Set<() => void>;
  recover(current: () => boolean): Promise<void>;
};
const sessions = new Map<string, AcceptedGoalSession>();
export function acceptedGoalSessionFor(owner: string): AcceptedGoalSession {
  const existing = sessions.get(owner);
  if (existing) return existing;
  const project = new URL(SUPABASE_PROJECT_URL).hostname.split('.')[0];
  // app.json declares the official SecureStore backup-exclusion plugin. This
  // prepares production source; it is not a claim of device/build verification.
  const journal = createSecureGoalRequestJournal(project, true);
  const save = createNutritionGoalSaveController({ client: supabase, journal });
  const restart = createJourneyRestartController({ client: supabase, journal });
  let recovery: Promise<void> | null = null;
  const session: AcceptedGoalSession = { save, restart, listeners: new Set(),
    async recover(current) {
      while (recovery) { await recovery.catch(() => {}); }
      if (!current()) throw new Error('Account or screen changed. Reopen to verify the request.');
      // A refocus during an in-flight RPC must not rehydrate/replace its state.
      if (save.isBusy() || restart.isBusy()) return;
      const flight = (async () => { await save.recover(owner,current); await restart.recover(owner,current); })();
      recovery = flight;
      try { await flight; } finally { if (recovery === flight) recovery = null; session.listeners.forEach(listener => listener()); }
    },
  };
  sessions.set(owner,session); return session;
}
