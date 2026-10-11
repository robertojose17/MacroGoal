// Temporary isolated privacy-component preview. Restore the original entry after QA.
// Production retains the exact original startup-module order.
if (__DEV__) {
  const { registerRootComponent } = require('expo');
  const PrivacyDevPreview = require('./features/communityPrivacyV2/PrivacyDevPreview').default;
  registerRootComponent(PrivacyDevPreview);
} else {
  require('./utils/errorLogger');
  require('expo-router/entry');
}
