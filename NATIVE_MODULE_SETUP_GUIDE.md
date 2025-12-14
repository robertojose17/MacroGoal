
# Native Speech Recognition Module - Setup Guide

## Overview

This guide will help you set up the native speech recognition module for the Macro Goal app. This module enables on-device speech-to-text transcription using:

- **iOS**: Speech framework (SFSpeechRecognizer)
- **Android**: SpeechRecognizer API

## Prerequisites

- Expo SDK 54+
- Xcode 14+ (for iOS development)
- Android Studio (for Android development)
- Node.js 18+

## Installation Steps

### 1. Verify Module Files

Ensure the following files exist in your project:

```
modules/expo-speech-recognition/
├── package.json
├── expo-module.config.json
├── src/
│   └── index.ts
├── ios/
│   └── ExpoSpeechRecognitionModule.swift
└── android/
    └── src/
        └── main/
            └── java/
                └── expo/
                    └── modules/
                        └── speechrecognition/
                            └── ExpoSpeechRecognitionModule.kt
```

### 2. Install Dependencies

```bash
# Install expo-modules-core if not already installed
npm install expo-modules-core

# Install the module locally
cd modules/expo-speech-recognition
npm install
cd ../..
```

### 3. Prebuild the Project

This step generates the native iOS and Android projects and links the native module:

```bash
npx expo prebuild --clean
```

This will:
- Generate the `ios/` and `android/` directories
- Link the native speech recognition module
- Configure permissions in Info.plist and AndroidManifest.xml

### 4. iOS-Specific Setup

#### 4.1. Verify Info.plist

The `app.json` already includes the speech recognition permission, but verify it's in your `ios/MacroGoal/Info.plist`:

```xml
<key>NSSpeechRecognitionUsageDescription</key>
<string>We need access to speech recognition to transcribe your voice input for the AI meal estimator</string>
```

#### 4.2. Build and Run

```bash
npx expo run:ios
```

Or open in Xcode:

```bash
open ios/MacroGoal.xcworkspace
```

Then build and run from Xcode.

### 5. Android-Specific Setup

#### 5.1. Verify Permissions

The `RECORD_AUDIO` permission should already be in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

#### 5.2. Known Limitation

Android's `SpeechRecognizer` API is designed for live audio input, not file-based transcription. The current implementation includes a placeholder that explains this limitation.

**Production Solutions for Android:**

1. **Option A: Live Recording (Recommended)**
   - Modify the recording flow to use `SpeechRecognizer.startListening()` directly
   - Transcribe in real-time as the user speaks
   - No file processing needed

2. **Option B: Google Cloud Speech-to-Text**
   - Use Google Cloud Speech-to-Text API for file transcription
   - Requires API key and billing setup
   - Provides high accuracy

3. **Option C: Whisper.cpp**
   - Integrate whisper.cpp for on-device transcription
   - Requires native C++ integration
   - Works offline

#### 5.3. Build and Run

```bash
npx expo run:android
```

Or open in Android Studio:

```bash
open -a "Android Studio" android/
```

Then build and run from Android Studio.

## Testing the Implementation

### 1. Test on iOS

1. Build and run the app on a physical iOS device (simulator works but may have limitations)
2. Navigate to the AI Meal Estimator
3. Tap the microphone button
4. Grant speech recognition permission when prompted
5. Speak clearly: "I had a chicken salad with grilled chicken, lettuce, tomatoes, and ranch dressing"
6. Tap stop
7. The transcribed text should appear in the input field and be sent to the AI

### 2. Test on Android

1. Build and run the app on a physical Android device
2. Navigate to the AI Meal Estimator
3. Tap the microphone button
4. Grant microphone permission when prompted
5. Currently, you'll see a message about Android file-based transcription
6. Implement one of the production solutions above for full functionality

## Troubleshooting

### iOS Issues

**Problem**: "Speech recognition permission denied"
- **Solution**: Go to Settings > Privacy & Security > Speech Recognition > Enable for Macro Goal

**Problem**: "Speech recognizer not available"
- **Solution**: Ensure you're testing on a device with iOS 10+ and internet connection (first-time setup requires network)

**Problem**: Module not found error
- **Solution**: Run `npx expo prebuild --clean` and rebuild

### Android Issues

**Problem**: "Native module not available"
- **Solution**: Ensure you ran `npx expo prebuild` and rebuilt the app

**Problem**: "NOT_IMPLEMENTED" error
- **Solution**: This is expected. Implement one of the production solutions for Android file transcription

### General Issues

**Problem**: "Voice transcription requires a native build"
- **Solution**: You're running in Expo Go. Native modules require a custom development build. Run `npx expo run:ios` or `npx expo run:android`

**Problem**: Audio file too small
- **Solution**: Speak for at least 1-2 seconds before stopping the recording

## Code Architecture

### Module Structure

```
ExpoSpeechRecognition (Native Module)
    ↓
localSpeechRecognition.native.ts (Platform Bridge)
    ↓
chatbot.tsx (UI Integration)
```

### Key Functions

1. **`requestPermissionsAsync()`**
   - Requests speech recognition permissions
   - iOS: SFSpeechRecognizer authorization
   - Android: Uses RECORD_AUDIO (already handled)

2. **`isAvailableAsync()`**
   - Checks if speech recognition is available
   - Returns boolean

3. **`transcribeAsync(audioUri, language)`**
   - Transcribes audio file to text
   - iOS: Uses SFSpeechURLRecognitionRequest
   - Android: Placeholder (needs implementation)

4. **`getSupportedLanguagesAsync()`**
   - Returns list of supported language codes
   - iOS: From SFSpeechRecognizer.supportedLocales()
   - Android: Hardcoded common languages

## Next Steps

### For iOS (Production Ready)

✅ The iOS implementation is complete and production-ready
- Test thoroughly on various iOS devices
- Test with different accents and speech patterns
- Test in noisy environments
- Monitor for any edge cases

### For Android (Needs Implementation)

Choose one of these approaches:

1. **Live Recording (Easiest)**
   - Modify the recording flow to use `SpeechRecognizer.startListening()`
   - Transcribe in real-time
   - Update UI to show live transcription

2. **Google Cloud Speech-to-Text (Best Accuracy)**
   - Sign up for Google Cloud
   - Enable Speech-to-Text API
   - Add API key to environment variables
   - Implement file upload and transcription

3. **Whisper.cpp (Best Privacy)**
   - Integrate whisper.cpp native library
   - Bundle model with app (increases app size)
   - Implement native transcription

## Performance Optimization

### iOS

- The Speech framework is highly optimized
- First transcription may take longer (model loading)
- Subsequent transcriptions are fast
- Works offline after initial setup

### Android

- Live recording is faster than file transcription
- Consider implementing streaming transcription
- Cache recognition results when possible

## Privacy & Security

- All transcription happens on-device (iOS)
- No audio data is sent to external servers
- User must explicitly grant permissions
- Permissions can be revoked in Settings

## Support

If you encounter issues:

1. Check the console logs for detailed error messages
2. Verify permissions are granted
3. Ensure you're using a custom development build (not Expo Go)
4. Test on a physical device (not simulator)
5. Check that the native module is properly linked

## Additional Resources

- [iOS Speech Framework Documentation](https://developer.apple.com/documentation/speech)
- [Android SpeechRecognizer Documentation](https://developer.android.com/reference/android/speech/SpeechRecognizer)
- [Expo Modules API](https://docs.expo.dev/modules/overview/)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)

## License

MIT
