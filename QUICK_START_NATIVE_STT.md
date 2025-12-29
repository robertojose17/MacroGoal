
# Quick Start: Native Speech-to-Text

## TL;DR - Get It Running Now

### iOS (Works Immediately)

```bash
# 1. Clean prebuild
npx expo prebuild --clean

# 2. Run on iOS
npx expo run:ios

# 3. Test it
# - Open AI Meal Estimator
# - Tap microphone
# - Grant permissions
# - Speak your meal
# - Watch it transcribe!
```

### Android (Needs Implementation)

```bash
# 1. Clean prebuild
npx expo prebuild --clean

# 2. Run on Android
npx expo run:android

# 3. Current status
# - Microphone button appears
# - Recording works
# - Transcription shows "not implemented" message
# - See NATIVE_MODULE_SETUP_GUIDE.md for implementation options
```

## What Changed

### Before
- ❌ Used OpenAI Whisper API
- ❌ Sent audio to external server
- ❌ Required API key and costs money
- ❌ Spanish error messages

### After
- ✅ Uses native iOS Speech framework
- ✅ All processing on-device
- ✅ No API costs
- ✅ All English error messages
- ✅ Works offline (iOS)
- ✅ Faster transcription

## File Structure

```
modules/expo-speech-recognition/     ← New native module
├── package.json
├── expo-module.config.json
├── src/index.ts                     ← TypeScript interface
├── ios/
│   └── ExpoSpeechRecognitionModule.swift  ← iOS implementation ✅
└── android/
    └── .../ExpoSpeechRecognitionModule.kt ← Android structure ⚠️

utils/
├── localSpeechRecognition.ts        ← Platform router
├── localSpeechRecognition.native.ts ← Updated to use native module
└── localSpeechRecognition.web.ts    ← Disabled

app.json                             ← Updated with permissions
```

## Testing Checklist

### iOS
- [ ] Run `npx expo prebuild --clean`
- [ ] Run `npx expo run:ios`
- [ ] Open AI Meal Estimator
- [ ] Tap microphone button
- [ ] Grant microphone permission
- [ ] Grant speech recognition permission
- [ ] Speak: "I had a chicken salad with grilled chicken"
- [ ] Tap stop
- [ ] Verify text appears in input
- [ ] Verify text is sent to AI
- [ ] Verify AI responds with meal estimate

### Android
- [ ] Run `npx expo prebuild --clean`
- [ ] Run `npx expo run:android`
- [ ] Open AI Meal Estimator
- [ ] Tap microphone button
- [ ] See "not implemented" message
- [ ] Choose implementation option from guide
- [ ] Implement chosen solution
- [ ] Test again

## Common Issues

### "Native module not available"
**Solution:** You're in Expo Go. Run `npx expo run:ios` or `npx expo run:android`

### "Speech recognition permission denied"
**Solution:** Go to Settings > Privacy > Speech Recognition > Enable for Macro Goal

### "Audio file too small"
**Solution:** Speak for at least 1-2 seconds before stopping

### Android "NOT_IMPLEMENTED"
**Solution:** This is expected. See NATIVE_MODULE_SETUP_GUIDE.md for implementation options

## Production Deployment

### iOS
1. Test thoroughly on physical devices
2. Test with various accents and speech patterns
3. Test in noisy environments
4. Build for TestFlight: `eas build --platform ios`
5. Submit to App Store

### Android
1. Implement one of the production solutions:
   - **Live Recording** (recommended - easiest)
   - **Google Cloud Speech-to-Text** (best accuracy)
   - **Whisper.cpp** (best privacy)
2. Test thoroughly on physical devices
3. Build for Play Store: `eas build --platform android`
4. Submit to Play Store

## Need Help?

1. **Setup Issues:** See `NATIVE_MODULE_SETUP_GUIDE.md`
2. **Implementation Details:** See `IMPLEMENTATION_COMPLETE_NATIVE_STT.md`
3. **Console Logs:** Look for `[LocalSTT]` and `[ExpoSpeechRecognition]` tags
4. **Permissions:** Check device Settings > Privacy/Permissions

## What's Next?

### iOS (Ready Now)
- ✅ Start using voice input immediately
- ✅ Test with real users
- ✅ Monitor for edge cases
- ✅ Deploy to production

### Android (Needs Work)
- ⚠️ Choose implementation approach
- ⚠️ Implement file transcription or live recording
- ⚠️ Test thoroughly
- ⚠️ Deploy to production

---

**Questions?** Check the detailed guides:
- `NATIVE_MODULE_SETUP_GUIDE.md` - Setup and troubleshooting
- `IMPLEMENTATION_COMPLETE_NATIVE_STT.md` - Technical details
- `VOICE_INPUT_IMPLEMENTATION_GUIDE.md` - Original requirements

**Ready to go?** Run `npx expo prebuild --clean && npx expo run:ios` 🚀
