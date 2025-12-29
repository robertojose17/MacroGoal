
# Build and Test Guide - Native STT

## Prerequisites

Before you start, make sure you have:

- [ ] Node.js 18+ installed
- [ ] Expo CLI installed (`npm install -g expo-cli`)
- [ ] Xcode 14+ (for iOS)
- [ ] Android Studio (for Android)
- [ ] Physical iOS device (recommended) or simulator
- [ ] Physical Android device (recommended) or emulator

## Step-by-Step Build Process

### 1. Clean Your Project

```bash
# Remove old build artifacts
rm -rf node_modules
rm -rf ios
rm -rf android
rm -rf .expo

# Clear npm cache
npm cache clean --force

# Reinstall dependencies
npm install
```

### 2. Prebuild the Project

This generates the native iOS and Android projects:

```bash
npx expo prebuild --clean
```

**What this does:**
- Generates `ios/` directory with Xcode project
- Generates `android/` directory with Android Studio project
- Links all native modules (including expo-speech-recognition)
- Configures permissions in Info.plist and AndroidManifest.xml
- Sets up build configurations

**Expected output:**
```
✔ Created native projects | /path/to/your/project
› Expo prebuild complete!
```

### 3. Build and Run on iOS

#### Option A: Using Expo CLI (Recommended)

```bash
npx expo run:ios
```

This will:
1. Build the iOS app
2. Install it on connected device or simulator
3. Launch the app
4. Start Metro bundler

#### Option B: Using Xcode

```bash
# Open the project in Xcode
open ios/MacroGoal.xcworkspace

# Then in Xcode:
# 1. Select your device or simulator
# 2. Click the Play button (▶️)
# 3. Wait for build to complete
# 4. App will launch automatically
```

**First build may take 5-10 minutes**

### 4. Build and Run on Android

#### Option A: Using Expo CLI (Recommended)

```bash
npx expo run:android
```

This will:
1. Build the Android app
2. Install it on connected device or emulator
3. Launch the app
4. Start Metro bundler

#### Option B: Using Android Studio

```bash
# Open the project in Android Studio
open -a "Android Studio" android/

# Then in Android Studio:
# 1. Wait for Gradle sync to complete
# 2. Select your device or emulator
# 3. Click the Run button (▶️)
# 4. Wait for build to complete
# 5. App will launch automatically
```

**First build may take 10-15 minutes**

## Testing the Voice Input Feature

### iOS Testing

1. **Launch the app**
   ```bash
   npx expo run:ios
   ```

2. **Navigate to AI Meal Estimator**
   - Tap on the "Dashboard" tab
   - Find and tap "AI Meal Estimator" card
   - Or navigate from the home screen

3. **Test microphone permissions**
   - Tap the microphone button (🎤)
   - You should see a permission dialog
   - Tap "Allow" for microphone access
   - You should see another dialog for speech recognition
   - Tap "OK" to allow

4. **Test voice recording**
   - Tap the microphone button again
   - The button should turn red (recording state)
   - You should see animated waveform bars
   - Speak clearly: "I had a chicken salad with grilled chicken, lettuce, tomatoes, and ranch dressing"
   - Tap the microphone button to stop
   - You should see "Transcribing..." indicator

5. **Verify transcription**
   - Wait 1-2 seconds
   - Transcribed text should appear in the input field
   - Text should be automatically sent to AI
   - AI should respond with meal estimate
   - You should see ingredient breakdown

6. **Test error cases**
   - Try recording without speaking (should show error)
   - Try very short recording <1 second (should show error)
   - Try in noisy environment (may fail gracefully)
   - Deny permissions and try again (should show permission error)

### Android Testing

1. **Launch the app**
   ```bash
   npx expo run:android
   ```

2. **Navigate to AI Meal Estimator**
   - Same as iOS

3. **Test microphone button**
   - Tap the microphone button
   - Grant microphone permission if prompted
   - Start recording
   - Speak your meal description
   - Stop recording

4. **Current expected behavior**
   - Recording works ✅
   - Waveform animation works ✅
   - Transcription shows "NOT_IMPLEMENTED" error ⚠️
   - This is expected until you implement one of the Android options

## Troubleshooting

### iOS Issues

#### "Command PhaseScriptExecution failed"
**Problem:** Build script error
**Solution:**
```bash
cd ios
pod deintegrate
pod install
cd ..
npx expo run:ios
```

#### "No such module 'ExpoSpeechRecognition'"
**Problem:** Native module not linked
**Solution:**
```bash
npx expo prebuild --clean
npx expo run:ios
```

#### "Speech recognition permission denied"
**Problem:** User denied permission
**Solution:**
1. Go to Settings > Privacy & Security > Speech Recognition
2. Enable for "Macro Goal"
3. Restart the app

#### "Speech recognizer not available"
**Problem:** Device doesn't support speech recognition
**Solution:**
- Ensure iOS 10+
- Ensure internet connection (first time only)
- Try restarting device

### Android Issues

#### "Could not resolve expo.modules.speechrecognition"
**Problem:** Native module not found
**Solution:**
```bash
npx expo prebuild --clean
npx expo run:android
```

#### "Gradle build failed"
**Problem:** Build configuration error
**Solution:**
```bash
cd android
./gradlew clean
cd ..
npx expo run:android
```

#### "NOT_IMPLEMENTED" error
**Problem:** Android transcription not implemented
**Solution:**
- This is expected
- See `ANDROID_IMPLEMENTATION_OPTIONS.md`
- Choose and implement one of the 3 options

### General Issues

#### Metro bundler not starting
**Problem:** Port conflict or cache issue
**Solution:**
```bash
# Kill existing Metro processes
pkill -f "react-native"

# Clear Metro cache
npx expo start --clear

# Or manually specify port
npx expo start --port 8082
```

#### "Unable to resolve module"
**Problem:** Module not found
**Solution:**
```bash
# Clear all caches
rm -rf node_modules
rm -rf .expo
npm cache clean --force
npm install
npx expo prebuild --clean
```

#### App crashes on launch
**Problem:** Various causes
**Solution:**
1. Check console logs for errors
2. Look for `[LocalSTT]` or `[ExpoSpeechRecognition]` errors
3. Verify permissions in app.json
4. Try clean rebuild:
   ```bash
   npx expo prebuild --clean
   npx expo run:ios  # or run:android
   ```

## Console Logs to Watch

### Successful iOS Transcription
```
[LocalSTT] Starting local transcription
[LocalSTT] Platform: ios
[LocalSTT] Audio URI: file:///path/to/audio.m4a
[LocalSTT] Audio file size: 45678 bytes
[LocalSTT] Starting transcription with native module...
[ExpoSpeechRecognition] Starting transcription...
[ExpoSpeechRecognition] Audio URI: file:///path/to/audio.m4a
[ExpoSpeechRecognition] Language: en-US
[ExpoSpeechRecognition] Transcription successful
[ExpoSpeechRecognition] Text: I had a chicken salad with grilled chicken
[ExpoSpeechRecognition] Confidence: 0.95
[LocalSTT] ✅ Transcription successful: I had a chicken salad with grilled chicken
[LocalSTT] Confidence: 0.95
```

### Expected Android Error (Until Implemented)
```
[LocalSTT] Starting local transcription
[LocalSTT] Platform: android
[LocalSTT] Audio URI: file:///path/to/audio.m4a
[LocalSTT] Audio file size: 45678 bytes
[LocalSTT] Starting transcription with native module...
[ExpoSpeechRecognition] Starting transcription...
[LocalSTT] Error during transcription: NOT_IMPLEMENTED
```

## Performance Benchmarks

### iOS
- **First transcription:** 2-3 seconds (model loading)
- **Subsequent transcriptions:** 1-2 seconds
- **Audio recording:** Real-time
- **UI responsiveness:** Smooth (60 FPS)

### Android (After Implementation)
- **Depends on chosen option**
- **Live recording:** 1-2 seconds
- **File transcription:** Varies

## Testing Checklist

### Basic Functionality
- [ ] App builds successfully
- [ ] App launches without crashes
- [ ] Can navigate to AI Meal Estimator
- [ ] Microphone button is visible
- [ ] Can tap microphone button
- [ ] Permission dialogs appear
- [ ] Can grant permissions
- [ ] Recording starts when tapped
- [ ] Waveform animation shows
- [ ] Recording stops when tapped
- [ ] Transcription indicator shows
- [ ] Text appears in input (iOS)
- [ ] Text is sent to AI
- [ ] AI responds with estimate

### Error Handling
- [ ] Short recording shows error
- [ ] No speech shows error
- [ ] Permission denied shows error
- [ ] Network error handled gracefully
- [ ] All errors in English

### Edge Cases
- [ ] Multiple recordings in a row
- [ ] Cancel recording mid-way
- [ ] Background app during recording
- [ ] Low battery during recording
- [ ] Airplane mode (iOS should work)
- [ ] Different accents
- [ ] Background noise
- [ ] Very long recordings (>30s)

## Next Steps After Testing

### If iOS Works ✅
1. Test on multiple iOS devices
2. Test with different iOS versions
3. Test with different accents
4. Test in various environments
5. Build for TestFlight
6. Internal testing
7. Submit to App Store

### If Android Needs Implementation ⚠️
1. Choose implementation option
2. Follow guide in `ANDROID_IMPLEMENTATION_OPTIONS.md`
3. Implement chosen solution
4. Test thoroughly
5. Build for Play Store
6. Internal testing
7. Submit to Play Store

## Build for Production

### iOS (TestFlight)
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

### Android (Play Store)
```bash
# Build for Android
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Support

**Need help?**
1. Check console logs
2. Read error messages carefully
3. Search for `[LocalSTT]` and `[ExpoSpeechRecognition]` in logs
4. Check `NATIVE_MODULE_SETUP_GUIDE.md`
5. Check `ANDROID_IMPLEMENTATION_OPTIONS.md`

**Still stuck?**
- Verify all prerequisites are installed
- Try clean rebuild
- Test on physical device (not simulator)
- Check device permissions in Settings

---

**Ready to build?** Start with Step 1 above! 🚀
