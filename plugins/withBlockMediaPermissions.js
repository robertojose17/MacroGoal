const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

// These are unused: the app uses the system photo picker and foreground-only
// voice recording. RECORD_AUDIO and MODIFY_AUDIO_SETTINGS remain available.
const BLOCKED_PERMISSIONS = [
  // Health Connect exposes Steps only on Android; keep unused library scopes out.
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_FLOORS_CLIMBED',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE',
];
const BLOCKED_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
];

function removeAtMerge(entries, names) {
  const blocked = new Set(names);
  return [
    ...(entries || []).filter((entry) => !blocked.has(entry.$?.['android:name'])),
    ...names.map((name) => ({ $: { 'android:name': name, 'tools:node': 'remove' } })),
  ];
}

function blockMediaManifest(manifest) {
  AndroidConfig.Manifest.ensureToolsAvailable(manifest);
  // Deleting nodes is insufficient: lower-priority library manifests add them
  // back. Keep explicit removal markers through the final Gradle merge.
  for (const tag of ['uses-permission', 'uses-permission-sdk-23']) {
    if (tag === 'uses-permission' || manifest.manifest[tag]) {
      manifest.manifest[tag] = removeAtMerge(manifest.manifest[tag], BLOCKED_PERMISSIONS);
    }
  }
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  application.service = removeAtMerge(application.service, BLOCKED_SERVICES);
  return manifest;
}

module.exports = function withBlockMediaPermissions(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = blockMediaManifest(config.modResults);
    return config;
  });
};
module.exports.blockMediaManifest = blockMediaManifest;
