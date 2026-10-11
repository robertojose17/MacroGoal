// Temporary DEV-only controller. No SDK, storage, UI, or network imports.
export const TEST_ID = '08298ac2-907b-4073-8a6e-6ce246a8fd64';
export const TEST_EMAIL = 'macrogoal-test-20261011@tests.invalid';
export const ATTEMPT_KEY = 'macrogoal:dev:test-profile-retry:08298ac2:20261011:v1';
const RESERVED = 'reserved-before-request-v1';

export type ProfileCheck = 'present' | 'absent' | 'unknown';
export type RetryResult =
  | { kind: 'blocked' }
  | { kind: 'finished'; handlerAccepted: boolean; profile: ProfileCheck };
export type Readiness = 'ready' | 'sign-in-required' | 'other-account' | 'locked';

export interface TestAuthorization {
  id: string;
  email: string | undefined;
  // The adapter must bind both operations to the server-validated access token.
  invokeOnce(): Promise<boolean>;
  selectOwnId(): Promise<ProfileCheck>;
}
export interface RetryDependencies {
  readMarker(): Promise<string | null>;
  writeMarker(value: string): Promise<void>;
  authorize(): Promise<TestAuthorization | null>;
}

export function createTestProfileRetry(deps: RetryDependencies, development: boolean) {
  // The screen owns one module-level instance. Set synchronously before any await.
  let claimed = false;
  const isTest = (auth: TestAuthorization) => auth.id === TEST_ID && auth.email === TEST_EMAIL;

  return {
    async inspect(): Promise<Readiness> {
      if (!development || claimed) return 'locked';
      try {
        if (await deps.readMarker() !== null) return 'locked';
        const auth = await deps.authorize();
        if (claimed) return 'locked';
        return auth === null ? 'sign-in-required' : isTest(auth) ? 'ready' : 'other-account';
      } catch {
        return 'locked';
      }
    },
    async retry(): Promise<RetryResult> {
      if (!development || claimed) return { kind: 'blocked' };
      claimed = true;
      try {
        if (await deps.readMarker() !== null) return { kind: 'blocked' };
        // Write and read back before authorization and before the only mutation.
        // Any uncertainty permanently consumes this local attempt; never clear it.
        await deps.writeMarker(RESERVED);
        if (await deps.readMarker() !== RESERVED) return { kind: 'blocked' };
        const auth = await deps.authorize();
        if (!auth || !isTest(auth)) return { kind: 'blocked' };
        let handlerAccepted = false;
        try { handlerAccepted = await auth.invokeOnce(); } catch { /* No retry. */ }
        let profile: ProfileCheck = 'unknown';
        // Verify even after an uncertain response. This is SELECT only.
        try { profile = await auth.selectOwnId(); } catch { /* Keep unknown. */ }
        return { kind: 'finished', handlerAccepted, profile };
      } catch {
        return { kind: 'blocked' };
      }
    },
  };
}
