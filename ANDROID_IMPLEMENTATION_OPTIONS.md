
# Android Speech Recognition Implementation Options

## The Challenge

Android's `SpeechRecognizer` API is designed for **live audio input**, not file-based transcription. The current implementation records audio to a file (using expo-audio), but Android's native API can't directly transcribe from files.

## Solution Options

### Option 1: Live Recording (Recommended) ⭐

**Best for:** Quick implementation, native feel, no external dependencies

**How it works:**
- Replace file-based recording with live `SpeechRecognizer`
- Transcribe in real-time as user speaks
- Show live transcription in UI
- No file processing needed

**Pros:**
- ✅ Fastest implementation
- ✅ Native Android experience
- ✅ No API costs
- ✅ Works offline
- ✅ Real-time feedback

**Cons:**
- ❌ Different UX from iOS (live vs file-based)
- ❌ Requires internet for first use
- ❌ May be less accurate than file-based

**Implementation:**

```kotlin
// In ExpoSpeechRecognitionModule.kt

AsyncFunction("startLiveRecognition") { language: String, promise: Promise ->
  val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
  }

  speechRecognizer?.setRecognitionListener(object : RecognitionListener {
    override fun onResults(results: Bundle?) {
      val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      if (matches != null && matches.isNotEmpty()) {
        promise.resolve(mapOf(
          "text" to matches[0],
          "confidence" to 1.0,
          "isFinal" to true
        ))
      }
    }
    
    override fun onPartialResults(partialResults: Bundle?) {
      // Send partial results to UI for real-time feedback
      val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
      if (matches != null && matches.isNotEmpty()) {
        sendEvent("onPartialResult", mapOf("text" to matches[0]))
      }
    }
    
    // ... other callbacks
  })

  speechRecognizer?.startListening(intent)
}

AsyncFunction("stopLiveRecognition") {
  speechRecognizer?.stopListening()
}
```

**UI Changes:**

```typescript
// In chatbot.tsx
const handleStartRecording = async () => {
  if (Platform.OS === 'android') {
    // Use live recognition on Android
    await ExpoSpeechRecognition.startLiveRecognition('en-US');
  } else {
    // Use file-based on iOS
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }
  setIsRecording(true);
};

const handleStopRecording = async () => {
  if (Platform.OS === 'android') {
    await ExpoSpeechRecognition.stopLiveRecognition();
  } else {
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    await transcribeAudioLocally(uri, handleTranscriptionResult, handleTranscriptionError);
  }
  setIsRecording(false);
};
```

---

### Option 2: Google Cloud Speech-to-Text

**Best for:** Highest accuracy, production-grade solution

**How it works:**
- Record audio to file (current implementation)
- Upload file to Google Cloud Speech-to-Text API
- Receive transcription
- Display in UI

**Pros:**
- ✅ Highest accuracy
- ✅ Supports many languages
- ✅ Handles background noise well
- ✅ Same UX as iOS (file-based)
- ✅ Well-documented API

**Cons:**
- ❌ Requires Google Cloud account
- ❌ Costs money (but cheap: $0.006/15 seconds)
- ❌ Requires internet connection
- ❌ Audio sent to external server (privacy concern)

**Setup:**

1. **Create Google Cloud Project:**
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   
   # Login and create project
   gcloud auth login
   gcloud projects create macro-goal-stt
   gcloud config set project macro-goal-stt
   
   # Enable Speech-to-Text API
   gcloud services enable speech.googleapis.com
   
   # Create service account and key
   gcloud iam service-accounts create stt-service-account
   gcloud projects add-iam-policy-binding macro-goal-stt \
     --member="serviceAccount:stt-service-account@macro-goal-stt.iam.gserviceaccount.com" \
     --role="roles/speech.client"
   gcloud iam service-accounts keys create key.json \
     --iam-account=stt-service-account@macro-goal-stt.iam.gserviceaccount.com
   ```

2. **Add API Key to Supabase:**
   ```bash
   # In Supabase dashboard, add secret:
   GOOGLE_CLOUD_API_KEY=<your-api-key>
   ```

3. **Create Edge Function:**

```typescript
// supabase/functions/transcribe-audio-google/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { audioBase64 } = await req.json();
  
  const response = await fetch(
    'https://speech.googleapis.com/v1/speech:recognize',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('GOOGLE_CLOUD_API_KEY')}`,
      },
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
        },
        audio: {
          content: audioBase64,
        },
      }),
    }
  );

  const data = await response.json();
  const transcript = data.results?.[0]?.alternatives?.[0]?.transcript || '';
  
  return new Response(
    JSON.stringify({ text: transcript }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

4. **Update Client:**

```typescript
// In utils/localSpeechRecognition.native.ts (Android only)
export async function transcribeAudioLocally(
  audioUri: string,
  onSuccess: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  if (Platform.OS === 'android') {
    // Read audio file and convert to base64
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Call Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('transcribe-audio-google', {
      body: { audioBase64 },
    });

    if (error) {
      onError('Failed to transcribe audio');
      return;
    }

    onSuccess(data.text);
  } else {
    // iOS uses native module
    // ... existing iOS code
  }
}
```

**Cost Estimate:**
- $0.006 per 15 seconds of audio
- Average meal description: 10-15 seconds
- Cost per transcription: ~$0.004-0.006
- 1000 transcriptions: ~$4-6

---

### Option 3: Whisper.cpp (On-Device)

**Best for:** Privacy, offline functionality, no API costs

**How it works:**
- Bundle Whisper model with app
- Use whisper.cpp for on-device transcription
- Process audio file locally
- No internet required

**Pros:**
- ✅ Fully offline
- ✅ No API costs
- ✅ Best privacy (no data leaves device)
- ✅ Same UX as iOS (file-based)
- ✅ High accuracy

**Cons:**
- ❌ Increases app size (~40-100MB for model)
- ❌ Complex native integration
- ❌ Slower on older devices
- ❌ Requires C++ knowledge

**Implementation:**

1. **Add whisper.cpp to project:**

```bash
# Clone whisper.cpp
cd android/app/src/main/cpp
git clone https://github.com/ggerganov/whisper.cpp.git

# Download model
cd whisper.cpp/models
./download-ggml-model.sh base.en
```

2. **Create JNI wrapper:**

```cpp
// android/app/src/main/cpp/WhisperJNI.cpp
#include <jni.h>
#include "whisper.cpp/whisper.h"

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_speechrecognition_WhisperWrapper_transcribe(
    JNIEnv* env,
    jobject /* this */,
    jstring audioPath,
    jstring modelPath) {
    
    const char* audio_path = env->GetStringUTFChars(audioPath, 0);
    const char* model_path = env->GetStringUTFChars(modelPath, 0);
    
    // Load model
    struct whisper_context* ctx = whisper_init_from_file(model_path);
    
    // Load audio
    std::vector<float> pcmf32;
    // ... load audio file into pcmf32
    
    // Run inference
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.language = "en";
    whisper_full(ctx, params, pcmf32.data(), pcmf32.size());
    
    // Get result
    const int n_segments = whisper_full_n_segments(ctx);
    std::string result;
    for (int i = 0; i < n_segments; ++i) {
        result += whisper_full_get_segment_text(ctx, i);
    }
    
    whisper_free(ctx);
    
    return env->NewStringUTF(result.c_str());
}
```

3. **Update Kotlin module:**

```kotlin
// In ExpoSpeechRecognitionModule.kt
class WhisperWrapper {
    external fun transcribe(audioPath: String, modelPath: String): String
    
    companion object {
        init {
            System.loadLibrary("whisper-jni")
        }
    }
}

AsyncFunction("transcribeAsync") { audioUri: String, language: String, promise: Promise ->
    val whisper = WhisperWrapper()
    val modelPath = "${context.filesDir}/models/ggml-base.en.bin"
    
    try {
        val text = whisper.transcribe(audioUri, modelPath)
        promise.resolve(mapOf(
            "text" to text,
            "confidence" to 1.0,
            "isFinal" to true
        ))
    } catch (e: Exception) {
        promise.reject("TRANSCRIPTION_ERROR", e.message, e)
    }
}
```

4. **Update CMakeLists.txt:**

```cmake
# android/app/src/main/cpp/CMakeLists.txt
cmake_minimum_required(VERSION 3.4.1)

add_library(whisper-jni SHARED
    WhisperJNI.cpp
    whisper.cpp/whisper.cpp
    whisper.cpp/ggml.c
)

target_link_libraries(whisper-jni
    android
    log
)
```

---

## Comparison Table

| Feature | Live Recording | Google Cloud | Whisper.cpp |
|---------|---------------|--------------|-------------|
| **Accuracy** | Good | Excellent | Excellent |
| **Speed** | Fast | Medium | Slow |
| **Privacy** | Good | Poor | Excellent |
| **Cost** | Free | ~$0.005/use | Free |
| **Offline** | No* | No | Yes |
| **Complexity** | Low | Medium | High |
| **App Size** | +0MB | +0MB | +40-100MB |
| **UX Match iOS** | No | Yes | Yes |

*Requires internet for first use

## Recommendation

### For Quick Launch: **Option 1 (Live Recording)**
- Fastest to implement
- Good enough accuracy
- Native Android feel
- Can always upgrade later

### For Best Experience: **Option 2 (Google Cloud)**
- Highest accuracy
- Same UX as iOS
- Easy to implement
- Low cost

### For Best Privacy: **Option 3 (Whisper.cpp)**
- Fully offline
- No data leaves device
- High accuracy
- Worth the complexity for privacy-focused users

## Implementation Timeline

### Option 1: Live Recording
- **Time:** 2-4 hours
- **Difficulty:** Easy
- **Files to modify:** 2-3

### Option 2: Google Cloud
- **Time:** 4-6 hours
- **Difficulty:** Medium
- **Files to modify:** 3-4
- **Setup:** Google Cloud account

### Option 3: Whisper.cpp
- **Time:** 1-2 days
- **Difficulty:** Hard
- **Files to modify:** 5-10
- **Setup:** C++ build environment

## Next Steps

1. **Choose an option** based on your priorities
2. **Follow the implementation guide** for your chosen option
3. **Test thoroughly** on multiple Android devices
4. **Monitor performance** and user feedback
5. **Iterate** based on results

## Need Help?

- **Live Recording:** Check Android SpeechRecognizer docs
- **Google Cloud:** Check Google Cloud Speech-to-Text docs
- **Whisper.cpp:** Check whisper.cpp GitHub repo

---

**Ready to implement?** Start with Option 1 for the quickest path to production! 🚀
