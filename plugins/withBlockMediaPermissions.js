const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Removes READ_MEDIA_IMAGES and READ_MEDIA_VIDEO from the Android manifest.
 * The app uses the system photo picker (no broad gallery access needed).
 */
module.exports = function withBlockMediaPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const permissions = manifest.manifest['uses-permission'] || [];
    manifest.manifest['uses-permission'] = permissions.filter((perm) => {
      const name = perm.$?.['android:name'] || '';
      return (
        name !== 'android.permission.READ_MEDIA_IMAGES' &&
        name !== 'android.permission.READ_MEDIA_VIDEO' &&
        name !== 'android.permission.READ_MEDIA_AUDIO'
      );
    });
    return config;
  });
};
