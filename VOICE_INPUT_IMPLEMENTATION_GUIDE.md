
# Voice Input Implementation Guide

## Current Status

The AI chatbot microphone feature has been updated to use **local, on-device speech-to-text** instead of OpenAI's Whisper API. However, the actual transcription functionality requires additional implementation.

### What Works Now

✅ Microphone button appears on iOS and Android (hidden on web)
✅ Audio recording with expo-audio
✅ Real-time audio visualization during recording
✅ Proper permission handling
✅ Smooth UX with "Transcribing..." indicator
✅ Integration with existing OpenRouter chat flow
✅ All error messages in English

### What Needs Implementation

❌ Actual speech-to-text transcription
❌ Native module for iOS/Android speech recognition

## Why Local STT?

The previous implementation used OpenAI's Whisper API through a Supabase Edge Function. The new requirement is to use **local, on-device** speech recognition to:

- Avoid sending audio to OpenAI
- Keep using OpenRouter for AI chat (not OpenAI)
- Work 100% on mobile devices
- Provide faster transcription
- Reduce API costs

## Implementation Options

### Option A: Native Module (Recommended for Production)

**Best for:** Privacy, offline functionality, no API costs

**Implementation:**

1. Create a native module using expo-modules-core
2. iOS: Use Speech framework (SFSpeechRecognizer)
3. Android: Use SpeechRecognizer API

**Pros:**
- Fully local, no data leaves device
- Works offline
- No API costs
- Fast transcription
- Native quality

**Cons:**
- Requires native development (Swift/Kotlin)
- More complex setup
- Needs custom development build

**Code Structure:**
```
modules/
  expo-speech-recognition/
    ios/
      ExpoSpeechRecognitionModule.swift
    android/
      ExpoSpeechRecognitionModule.kt
    src/
      index.ts
```

**iOS Implementation (Speech framework):**
```swift
import Speech

@objc(ExpoSpeechRecognitionModule)
class ExpoSpeechRecognitionModule: Module {
  func definition() -> ModuleDefinition {
    Name("ExpoSpeechRecognition")
    
    AsyncFunction("transcribe") { (audioUri: String, language: String) -> [String: Any] in
      let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language))
      let request = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: audioUri))
      
      return try await withCheckedThrowingContinuation { continuation in
        recognizer?.recognitionTask(with: request) { result, error in
          if let error = error {
            continuation.resume(throwing: error)
            return
          }
          
          if let result = result, result.isFinal {
            continuation.resume(returning: [
              "text": result.bestTranscription.formattedString,
              "confidence": result.bestTranscription.segments.first?.confidence ?? 0.0
            ])
          }
        }
      }
    }
  }
}
```

**Android Implementation (SpeechRecognizer):**
```kotlin
package expo.modules.speechrecognition

import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoSpeechRecognitionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoSpeechRecognition")
    
    AsyncFunction("transcribe") { audioUri: String, language: String ->
      val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
      }
      
      // Implementation details...
      return@AsyncFunction mapOf(
        "text" to transcribedText,
        "confidence" to confidence
      )
    }
  }
}
```

### Option B: Self-Hosted Whisper API

**Best for:** Balance of accuracy and control

**Implementation:**

1. Deploy Whisper model on your server
2. Use whisper.cpp for efficient inference
3. Create a simple API endpoint
4. Update the transcription function to call your endpoint

**Pros:**
- Good accuracy (OpenAI Whisper quality)
- You control the data
- Can optimize for your use case
- No per-request API costs

**Cons:**
- Requires server infrastructure
- Ongoing hosting costs
- Network latency
- Doesn't work offline

**Server Setup (Python + FastAPI):**
```python
from fastapi import FastAPI, File, UploadFile
import whisper

app = FastAPI()
model = whisper.load_model("base")

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    result = model.transcribe(audio.file, language="en")
    return {"text": result["text"]}
```

**Client Update:**
```typescript
// In utils/localSpeechRecognition.native.ts
export async function transcribeAudioLocally(
  audioUri: string,
  onSuccess: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  const formData = new FormData();
  formData.append('audio', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as any);

  const response = await fetch('https://your-server.com/transcribe', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  onSuccess(data.text);
}
```

### Option C: React Native Voice Library

**Best for:** Quick implementation

**Implementation:**

1. Install @react-native-voice/voice
2. Requires custom development build (not pure Expo)
3. Update transcription function

**Pros:**
- Easy to integrate
- Well-maintained library
- Good documentation
- Works well on both platforms

**Cons:**
- Requires custom development build
- Not compatible with Expo Go
- Adds native dependency

**Installation:**
```bash
npx expo install @react-native-voice/voice
npx expo prebuild
```

**Usage:**
```typescript
import Voice from '@react-native-voice/voice';

export async function transcribeAudioLocally(
  audioUri: string,
  onSuccess: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  Voice.onSpeechResults = (e) => {
    if (e.value && e.value[0]) {
      onSuccess(e.value[0]);
    }
  };

  Voice.onSpeechError = (e) => {
    onError('Could not transcribe audio');
  };

  await Voice.start('en-US');
}
```

## Current Code Structure

### Files Modified

1. **app/chatbot.tsx**
   - Removed OpenAI Whisper API calls
   - Added local STT integration
   - Mic button hidden on web
   - Improved error handling (all English)

2. **utils/localSpeechRecognition.ts**
   - Main export file
   - Platform detection

3. **utils/localSpeechRecognition.native.ts**
   - iOS/Android implementation
   - Currently returns helpful error message
   - Ready for native module integration

4. **utils/localSpeechRecognition.web.ts**
   - Web implementation (disabled)
   - Returns error message

### Integration Points

The transcription function is called from `chatbot.tsx`:

```typescript
await transcribeAudioLocally(uri, handleTranscriptionResult, handleTranscriptionError);
```

**Success callback:**
```typescript
const handleTranscriptionResult = (transcribedText: string) => {
  setInputText(transcribedText);
  handleSendTranscribedText(transcribedText);
};
```

**Error callback:**
```typescript
const handleTranscriptionError = (error: string) => {
  Alert.alert('Transcription Error', "We couldn't transcribe that. Please try again.");
};
```

## Testing the Current Implementation

1. **Build the app:**
   ```bash
   npx expo prebuild
   npx expo run:ios
   # or
   npx expo run:android
   ```

2. **Test the microphone:**
   - Open AI Meal Estimator
   - Tap the microphone button
   - Speak for a few seconds
   - Tap stop
   - You'll see "Transcribing..." indicator
   - Currently shows error message (expected)

3. **Verify audio recording:**
   - Check console logs for audio file URI
   - Verify file size is > 0 bytes
   - Confirm permissions are granted

## Next Steps

Choose one of the implementation options above and:

1. Implement the transcription logic
2. Test on real devices (iOS and Android)
3. Handle edge cases (no speech, background noise, etc.)
4. Ensure language is forced to "en-US"
5. Test the full flow: mic → transcribe → AI response

## Important Notes

- **Do NOT use OpenAI** anywhere in the transcription pipeline
- **Keep using OpenRouter** for AI chat completions
- **Force language to English** ("en-US") to avoid Spanish errors
- **Test on real devices**, not just simulators
- **Handle permissions** properly on both platforms
- **Provide clear error messages** in English only

## Support

If you need help implementing any of these options:

1. **Native Module:** Requires Swift/Kotlin knowledge
2. **Self-hosted Whisper:** Requires server setup
3. **React Native Voice:** Easiest option, good starting point

For production, Option A (Native Module) is recommended for the best user experience and privacy.
