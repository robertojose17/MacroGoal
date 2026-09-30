const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Strips unwanted permissions and service declarations from the Android manifest:
 *  - READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO (system photo picker used instead)
 *  - FOREGROUND_SERVICE_MEDIA_PLAYBACK and FOREGROUND_SERVICE (injected by expo-audio; no
 *    foreground service is used in this app — RECORD_AUDIO is declared separately in app.json)
 *  - expo.modules.audio.service.AudioControlsService (service declaration injected by expo-audio)
 */

const BLOCKED_PERMISSIONS = new Set([
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE',
]);

const BLOCKED_SERVICES = new Set([
  'expo.modules.audio.service.AudioControlsService',
]);

module.exports = function withBlockMediaPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Strip blocked permissions
    const permissions = manifest.manifest['uses-permission'] || [];
    manifest.manifest['uses-permission'] = permissions.filter((perm) => {
      const name = perm.$?.['android:name'] || '';
      return !BLOCKED_PERMISSIONS.has(name);
    });

    // Strip blocked service declarations from the application block
    const application = manifest.manifest.application?.[0];
    if (application && Array.isArray(application.service)) {
      application.service = application.service.filter((svc) => {
        const name = svc.$?.['android:name'] || '';
        return !BLOCKED_SERVICES.has(name);
      });
    }

    return config;
  });
};
