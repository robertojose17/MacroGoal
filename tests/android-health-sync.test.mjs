import test from 'node:test';
import assert from 'node:assert/strict';
import { readAndroidSteps } from '../utils/healthConnectSteps.mjs';
import { saveFreshAndroidSteps } from '../utils/saveFreshAndroidSteps.mjs';

const date = new Date(2026, 10, 20, 13);
const readGrant = { recordType: 'Steps', accessType: 'read' };
function provider({ status = 3, granted = true, total = 3812 } = {}) {
  const calls = [];
  return { calls, sdk: {
    SdkAvailabilityStatus: { SDK_AVAILABLE: 3, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2 },
    getSdkStatus: async () => status,
    initialize: async () => { calls.push('init'); return true; },
    getGrantedPermissions: async () => granted ? [readGrant] : [],
    aggregateRecord: async options => { calls.push(options); return { COUNT_TOTAL: total }; },
  } };
}
function run(sdk, save) { return saveFreshAndroidSteps({
  date, toDateKey: () => '2026-11-20', read: target => readAndroidSteps(sdk, target), save,
}); }

test('first Android sync reads fresh aggregated Steps and saves that result for the same day', async () => {
  const { sdk, calls } = provider();
  const saved = [];
  const entry = await run(sdk, async (...args) => { saved.push(args); return { id: 'entry-1' }; });
  assert.deepEqual(entry, { id: 'entry-1' });
  assert.deepEqual(saved, [['2026-11-20', 3812]]);
  assert.deepEqual(calls[1], { recordType: 'Steps', timeRangeFilter: {
    operator: 'between',
    startTime: new Date(2026, 10, 20).toISOString(),
    endTime: new Date(2026, 10, 21).toISOString(),
  } });
});
test('missing provider, denied permission and no data do not overwrite saved steps', async () => {
  for (const input of [{ status: 2 }, { status: 1 }, { granted: false }, { total: 0 }]) {
    const { sdk } = provider(input);
    assert.equal(await run(sdk, async () => assert.fail('unexpected save')), null);
  }
});
test('provider update and missing Steps permission are distinct', async () => {
  const unavailable = provider({ status: 2 });
  const denied = provider({ granted: false });
  assert.match((await readAndroidSteps(unavailable.sdk, date)).error, /install or update/i);
  assert.match((await readAndroidSteps(denied.sdk, date)).error, /allow steps/i);
  assert.deepEqual(unavailable.calls, []);
  assert.deepEqual(denied.calls, ['init']);
});
test('invalid readings and write errors cannot be reported as saved', async () => {
  await assert.rejects(run(provider({ total: -1 }).sdk, async () => assert.fail('unexpected save')), /invalid step/);
  await assert.rejects(run(provider().sdk, async () => { throw new Error('database offline'); }), /database offline/);
});
