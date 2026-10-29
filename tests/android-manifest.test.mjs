import test from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/withBlockMediaPermissions.js';

const node = (name, extra = {}) => ({ $: { 'android:name': name, ...extra } });
const blockedPermissions = [
  'health.READ_ACTIVE_CALORIES_BURNED', 'health.READ_DISTANCE', 'health.READ_FLOORS_CLIMBED',
  'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO',
  'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'FOREGROUND_SERVICE_MICROPHONE',
].map(name => `android.permission.${name}`);
const blockedServices = ['AudioControlsService', 'AudioRecordingService']
  .map(name => `expo.modules.audio.service.${name}`);
const allowed = ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'CAMERA', 'ACTIVITY_RECOGNITION',
  'health.READ_STEPS'].map(name => `android.permission.${name}`);
const fixture = () => ({ manifest: {
  $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
  'uses-permission': [...allowed.map(name => node(name)),
    node('android.permission.FOREGROUND_SERVICE', { 'tools:node': 'remove' }),
    node('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK')],
  application: [{ $: { 'android:name': '.MainApplication' }, service: [
    node(blockedServices[0], { 'android:foregroundServiceType': 'mediaPlayback' }),
    node('example.KeepService', { 'android:exported': 'false' }),
  ] }],
} });

function assertRemoved(entries, names) {
  for (const name of names) {
    const matches = entries.filter(entry => entry.$['android:name'] === name);
    assert.deepEqual(matches, [node(name, { 'tools:node': 'remove' })]);
  }
}

test('keeps merger removal markers even when declarations come only from libraries', () => {
  const manifest = fixture();
  plugin.blockMediaManifest(manifest);
  assert.equal(manifest.manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
  assertRemoved(manifest.manifest['uses-permission'], blockedPermissions);
  assertRemoved(manifest.manifest.application[0].service, blockedServices);
});

test('preserves foreground recording, health scopes and unrelated services without duplicates', () => {
  const manifest = fixture();
  plugin.blockMediaManifest(manifest);
  const once = structuredClone(manifest);
  plugin.blockMediaManifest(manifest);
  assert.deepEqual(manifest, once);
  for (const name of allowed) {
    assert.deepEqual(manifest.manifest['uses-permission'].find(entry => entry.$['android:name'] === name), node(name));
  }
  assert.deepEqual(manifest.manifest.application[0].service.find(entry => entry.$['android:name'] === 'example.KeepService'),
    node('example.KeepService', { 'android:exported': 'false' }));
});

test('also blocks sdk-23 declarations and supports applications with no service list', () => {
  const manifest = fixture();
  delete manifest.manifest.application[0].service;
  manifest.manifest['uses-permission-sdk-23'] = [node('android.permission.FOREGROUND_SERVICE'), node('android.permission.CAMERA')];
  plugin.blockMediaManifest(manifest);
  assertRemoved(manifest.manifest['uses-permission-sdk-23'], blockedPermissions);
  assert.deepEqual(manifest.manifest['uses-permission-sdk-23'].find(entry => entry.$['android:name'] === 'android.permission.CAMERA'), node('android.permission.CAMERA'));
  assertRemoved(manifest.manifest.application[0].service, blockedServices);
});
