const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

/**
 * Excludes react-native-worklets from Android auto-linking.
 * react-native-reanimated v4.x bundles worklets internally.
 * Having both linked natively causes duplicate C++ symbols (worklets::*)
 * at JNI load time → SIGABRT before JavaScript starts.
 */
function withExcludeWorkletsAndroid(config) {
  // Step 1: Remove react-native-worklets from settings.gradle auto-link
  config = withSettingsGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Remove the react-native-worklets include line if present
    // Auto-linking adds: include ':react-native-worklets'
    // and: project(':react-native-worklets').projectDir = ...
    contents = contents.replace(
      /\n\/\/ react-native-worklets[^\n]*\ninclude ':react-native-worklets'[^\n]*\nproject\(':react-native-worklets'\)[^\n]*\n/g,
      '\n'
    );
    // Also handle the autolinking generated format
    contents = contents.replace(
      /include ':react-native-worklets'\nproject\(':react-native-worklets'\)\.projectDir[^\n]*\n/g,
      ''
    );

    cfg.modResults.contents = contents;
    return cfg;
  });

  // Step 2: Add exclusion in app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const MARKER = '// withExcludeWorkletsAndroid: exclude react-native-worklets';
    if (contents.includes(MARKER)) {
      return cfg;
    }

    // Add configurations.all exclusion block after the android { block opens
    const exclusionBlock = `
${MARKER}
// react-native-reanimated v4.x bundles worklets internally.
// Excluding react-native-worklets prevents duplicate C++ symbol crashes.
configurations.all {
    exclude group: 'com.swmansion.worklets', module: 'react-native-worklets'
}
`;

    // Insert before the android { block
    contents = contents.replace(
      /^(android \{)/m,
      exclusionBlock + '$1'
    );

    cfg.modResults.contents = contents;
    return cfg;
  });

  return config;
}

module.exports = withExcludeWorkletsAndroid;
