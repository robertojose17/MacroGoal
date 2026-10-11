/** TEMPORARY QA FIXTURE. Never connect this module to a real service or enable the v2 flag. */
import type { FollowRequestAdapter, FollowRequestIdentity, InboxSession } from './followRequestTypes';
import type { ProfileInput } from './clientContracts';
import type { ProfileResponseV2, FollowRequestDescriptor } from './profileContracts';
import type { ProfileSupplementAdapter } from './profileSupplementTypes';
import { createOutboundFollowAdapter } from './outboundFollowAdapter';
import { createProfileScreenController } from './profileScreenController';

// Deliberately fictional, distinct IDs. No endpoint, credential, image URL, persistence or fetch.
export const QA_IDS = Object.freeze({
  viewer: 'feed0000-0000-4000-8000-000000000001',
  alder: 'feed0000-0000-4000-8000-000000000002',
  birch: 'feed0000-0000-4000-8000-000000000003',
  cedar: 'feed0000-0000-4000-8000-000000000004',
  requestA: 'feed0000-0000-4000-8000-000000000011',
  requestB: 'feed0000-0000-4000-8000-000000000012',
  outbound: 'feed0000-0000-4000-8000-000000000013',
  post: 'feed0000-0000-4000-8000-000000000021',
});
export const QA_TODAY = '2026-10-11';
export type QAProfileMode = 'limited' | 'accepted';

/** Construction is explicitly development-only; imports construct no fixture or controller. */
export function createPrivacyDevFixture(latencyMs = 180) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) throw new Error('QA fixture is unavailable.');
  const session: InboxSession = Object.freeze({ userId: QA_IDS.viewer, sessionKey: 'fictional-qa-session' });
  let rows: FollowRequestIdentity[] = [
    { requestId: QA_IDS.requestA, requesterId: QA_IDS.alder, revision: '1', displayName: 'QA Fictional Alder', username: 'qa_fictional_alder', avatarUrl: null },
    { requestId: QA_IDS.requestB, requesterId: QA_IDS.birch, revision: '1', displayName: 'QA Fictional Birch', username: 'qa_fictional_birch', avatarUrl: null },
  ];
  let descriptor: FollowRequestDescriptor | null = null;
  let blocked = false, listError = false, decisionError = false, profileError = false;
  const matches = (s: InboxSession) => s.userId === session.userId && s.sessionKey === session.sessionKey;
  const pause = (signal: AbortSignal) => new Promise<boolean>(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const finish = (value: boolean) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(value); };
    const cancel = () => finish(false);
    const timer = setTimeout(() => finish(!signal.aborted), latencyMs);
    signal.addEventListener('abort', cancel, { once: true });
  });
  const identity = { id: QA_IDS.cedar, username: 'qa_fictional_cedar', name: 'QA Fictional Cedar', full_name: 'QA Fictional Cedar', avatar_url: null };
  function profile(input: ProfileInput): ProfileResponseV2 {
    const accepted = !blocked && descriptor?.state === 'accepted';
    const pending = !blocked && descriptor?.state === 'pending';
    const amounts = { calories: 1800, protein: 120, carbs: 190, fats: 60, fiber: 24 };
    const dayCount = Math.round((Date.parse(input.toDate) - Date.parse(input.fromDate)) / 86400000) + 1;
    const days = Array.from({ length: dayCount }, (_, i) => ({ ...amounts, has_logged_items: true,
      date: new Date(Date.parse(input.fromDate) + i * 86400000).toISOString().slice(0, 10) }));
    return {
      response_version: 2, target_user_id: QA_IDS.cedar, is_own_profile: false,
      can_discover_profile: !blocked, discovery: blocked ? null : { ...identity },
      is_following: blocked ? null : accepted, is_mutual: blocked ? null : false,
      follow_request_state: blocked ? null : accepted ? 'accepted' : pending ? 'pending' : 'none',
      follow_request: blocked || !descriptor ? null : { ...descriptor },
      is_accepted_follower: blocked ? null : accepted, can_view_profile: accepted, can_view_nutrition: accepted,
      nutrition_unavailable_reason: accepted ? null : blocked ? 'profile_unavailable' : pending ? 'approval_pending' : 'approval_required',
      user: accepted ? { ...identity, bio: 'Entirely fictional QA bio. No real person or health record.', is_premium: false } : null,
      metrics: accepted ? { streak: { status: 'available', current: 3, best: 8 },
        member_since: { status: 'available', month: '2026-01', calendar_basis: 'UTC' }, consistency: { status: 'hidden' },
        followers_count: { status: 'available', value: 1 }, following_count: { status: 'available', value: 0 },
        posts_count: { status: 'available', value: 1 } } : null,
      nutrition: accepted ? { from_date: input.fromDate, to_date: input.toDate, day_count: dayCount,
        date_basis: 'meal_date', calendar_basis: 'request_calendar_dates', goals_scope: 'current',
        current_goals: { calories: 2000, protein: 130, carbs: 220, fats: 65, fiber: 28 },
        totals: { calories: amounts.calories * dayCount, protein: amounts.protein * dayCount,
          carbs: amounts.carbs * dayCount, fats: amounts.fats * dayCount, fiber: amounts.fiber * dayCount },
        daily_average: { ...amounts }, days, days_tracked: dayCount,
        units: { calories: 'kcal', protein: 'g', carbs: 'g', fats: 'g', fiber: 'g' } } : null,
    };
  }
  const inbox: FollowRequestAdapter = {
    async list({ session: s, cursor, signal }) {
      if (!(await pause(signal)) || !matches(s) || cursor !== null) return { ok: false };
      if (listError) { listError = false; return { ok: false }; }
      return { ok: true, value: { ownerUserId: session.userId, items: rows.map(row => ({ ...row })), totalPending: rows.length, nextCursor: null } };
    },
    async respond({ session: s, requestId, requesterId, expectedRevision, decision, signal }) {
      if (!(await pause(signal)) || !matches(s)) return { ok: false };
      if (decisionError) { decisionError = false; return { ok: false }; }
      const row = rows.find(r => r.requestId === requestId && r.requesterId === requesterId && r.revision === expectedRevision);
      if (!row || !['accept', 'reject'].includes(decision)) return { ok: false };
      rows = rows.filter(r => r !== row);
      // Reverse approval intentionally does not change the viewer's access to Cedar.
      return { ok: true, value: { ownerUserId: session.userId, requestId, requesterId,
        previousRevision: expectedRevision, revision: String(BigInt(expectedRevision) + 1n),
        state: decision === 'accept' ? 'accepted' : 'rejected' } };
    },
  };
  const supplements: ProfileSupplementAdapter = {
    async posts({ session: s, targetUserId, signal }) {
      if (!(await pause(signal)) || !matches(s) || blocked || descriptor?.state !== 'accepted' || targetUserId !== QA_IDS.cedar) return { ok: false };
      return { ok: true, value: { targetUserId, items: [{ id: QA_IDS.post, content: 'Fictional QA post. Visible only in the accepted scenario.',
        created_at: `${QA_TODAY}T10:00:00Z`, likes_count: 0, post_type: 'general' }], hasMore: false, nextCursor: null } };
    },
    async connections({ session: s, targetUserId, direction, signal }) {
      if (!(await pause(signal)) || !matches(s) || blocked || descriptor?.state !== 'accepted' || targetUserId !== QA_IDS.cedar) return { ok: false };
      return { ok: true, value: { targetUserId, direction, items: direction === 'followers' ? [{ id: QA_IDS.viewer,
        name: 'QA Fictional Viewer', full_name: 'QA Fictional Viewer', username: 'qa_fictional_viewer', avatar_url: null }] : [] } };
    },
    async block({ session: s, targetUserId, signal }) {
      if (!(await pause(signal)) || !matches(s) || targetUserId !== QA_IDS.cedar) return { ok: false };
      blocked = true; descriptor = null;
      return { ok: true, value: { blockerId: s.userId, targetUserId } };
    },
    invalidate() {},
  };
  return {
    session, inbox,
    emptyInbox() { rows = []; },
    failNextList() { listError = true; },
    failNextDecision() { decisionError = true; },
    failNextProfile() { profileError = true; },
    setProfileMode(mode: QAProfileMode) {
      blocked = false;
      descriptor = mode === 'accepted' ? { request_id: QA_IDS.outbound, revision: '2', state: 'accepted' } : null;
    },
    createProfileController() {
      return createProfileScreenController(onInvalidate => createOutboundFollowAdapter({
        // A meaningless local string satisfies the real pure adapter's injected-session contract.
        getSession: async () => ({ ...session, accessToken: 'FICTIONAL_QA_NOT_A_CREDENTIAL', isAnonymous: false, expiresAtSeconds: 4102444800 }),
        now: () => 0, onInvalidate,
        fetchProfile: async (input, { signal }) => {
          if (!(await pause(signal)) || input.userId !== QA_IDS.cedar) return { ok: false, error: { kind: 'aborted', retryable: false } };
          if (profileError) { profileError = false; return { ok: false, error: { kind: 'network', retryable: true } }; }
          return { ok: true, value: profile(input) };
        },
        rpc: async ({ args, session: s, signal }) => {
          if (!(await pause(signal)) || !matches(s) || blocked || args.p_target_id !== QA_IDS.cedar ||
            args.p_request_id !== (descriptor?.request_id ?? null) || args.p_expected_revision !== (descriptor?.revision ?? '0')) return { data: null, error: true };
          const previousRevision = descriptor?.revision ?? '0';
          descriptor = { request_id: QA_IDS.outbound, revision: String(BigInt(previousRevision) + 1n),
            state: args.p_action === 'request' ? 'pending' : args.p_action === 'cancel' ? 'cancelled' : 'revoked' };
          return { data: { requesterUserId: s.userId, targetUserId: QA_IDS.cedar, action: args.p_action,
            previousRevision, follow_request: { ...descriptor } }, error: null };
        },
      }), () => supplements);
    },
  };
}
export type PrivacyDevFixture = ReturnType<typeof createPrivacyDevFixture>;
