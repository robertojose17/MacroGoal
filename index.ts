// Temporary isolated Test-only retry. Restore original entry immediately after QA.
if (__DEV__) {
  const { registerRootComponent } = require('expo');
  const TestProfileRetryScreen = require('./features/communityPrivacyV2/TestProfileRetryScreen').default;
  registerRootComponent(TestProfileRetryScreen);
} else {
  require('./utils/errorLogger');
  require('expo-router/entry');
}
