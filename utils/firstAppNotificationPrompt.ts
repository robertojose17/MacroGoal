export const NOTIFICATION_PROMPT_KEY = 'onesignal_prompt_shown_v1';

export function isFirstAppNotificationRoute(segments: readonly string[]): boolean {
  return segments[0] === '(tabs)' &&
    ((segments[1] === '(home)' && (segments.length === 2 || (segments.length === 3 && segments[2] === 'index'))) ||
      (segments[1] === 'coach' && segments.length === 2));
}

type Dependencies = {
  readMarker: () => Promise<string | null>;
  mark: () => Promise<void>;
  permission: () => Promise<{ status: string; canAskAgain: boolean }>;
  isCurrent: () => boolean;
  request: () => Promise<unknown>;
};

// One gate per JS runtime, plus a device-level durable guard shared by both tabs.
export function createFirstAppNotificationPrompt() {
  let busy = false;
  return async (deps: Dependencies): Promise<void> => {
    if (busy || !deps.isCurrent()) return;
    busy = true;
    try {
      if (await deps.readMarker()) return;
      const permission = await deps.permission();
      if (!deps.isCurrent()) return;
      if (permission.status !== 'undetermined' || !permission.canAskAgain) {
        // Preserve existing OS decisions, including denied/provisional grants.
        await deps.mark();
        return;
      }
      // Persist before requesting so remounts, concurrent tabs, and crashes do not re-prompt.
      await deps.mark();
      if (deps.isCurrent()) await deps.request();
    } finally {
      busy = false;
    }
  };
}

export const promptFirstAppNotifications = createFirstAppNotificationPrompt();

// Invalidates in-flight auth reads even before their owner has been resolved.
export function createNotificationSessionEpoch() {
  let revision = 0;
  return {
    capture: () => revision,
    invalidate: () => { revision += 1; },
    isCurrent: (captured: number) => captured === revision,
  };
}
