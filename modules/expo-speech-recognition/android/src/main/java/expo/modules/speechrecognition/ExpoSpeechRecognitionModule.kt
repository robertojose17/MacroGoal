
package expo.modules.speechrecognition

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class ExpoSpeechRecognitionModule : Module() {
  private var speechRecognizer: SpeechRecognizer? = null
  private var currentPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("ExpoSpeechRecognition")

    OnCreate {
      speechRecognizer = SpeechRecognizer.createSpeechRecognizer(appContext.reactContext)
    }

    OnDestroy {
      speechRecognizer?.destroy()
      speechRecognizer = null
    }

    // Request permissions (Android uses RECORD_AUDIO which is already handled by expo-audio)
    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      // On Android, we rely on RECORD_AUDIO permission from expo-audio
      // Speech recognition doesn't require additional permissions
      promise.resolve(mapOf("granted" to true))
    }

    // Check if speech recognition is available
    AsyncFunction("isAvailableAsync") { ->
      val isAvailable = SpeechRecognizer.isRecognitionAvailable(appContext.reactContext)
      isAvailable
    }

    // Transcribe audio from file
    AsyncFunction("transcribeAsync") { audioUri: String, language: String, promise: Promise ->
      if (speechRecognizer == null) {
        promise.reject("RECOGNIZER_ERROR", "Speech recognizer not initialized", null)
        return@AsyncFunction
      }

      if (!SpeechRecognizer.isRecognitionAvailable(appContext.reactContext)) {
        promise.reject("RECOGNIZER_UNAVAILABLE", "Speech recognition not available on this device", null)
        return@AsyncFunction
      }

      currentPromise = promise

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        
        // For file-based recognition, we need to use a different approach
        // Android SpeechRecognizer works with live audio, not files
        // We'll need to play the audio file and capture it
        // This is a limitation of Android's SpeechRecognizer API
      }

      speechRecognizer?.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
          // Ready to start listening
        }

        override fun onBeginningOfSpeech() {
          // User started speaking
        }

        override fun onRmsChanged(rmsdB: Float) {
          // Audio level changed
        }

        override fun onBufferReceived(buffer: ByteArray?) {
          // Audio buffer received
        }

        override fun onEndOfSpeech() {
          // User stopped speaking
        }

        override fun onError(error: Int) {
          val errorMessage = when (error) {
            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
            SpeechRecognizer.ERROR_NETWORK -> "Network error"
            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
            SpeechRecognizer.ERROR_NO_MATCH -> "No speech match"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognition service busy"
            SpeechRecognizer.ERROR_SERVER -> "Server error"
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "No speech input"
            else -> "Unknown error: $error"
          }
          
          currentPromise?.reject("TRANSCRIPTION_ERROR", errorMessage, null)
          currentPromise = null
        }

        override fun onResults(results: Bundle?) {
          val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          val confidences = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

          if (matches != null && matches.isNotEmpty()) {
            val text = matches[0]
            val confidence = confidences?.get(0) ?: 0.0f

            currentPromise?.resolve(mapOf(
              "text" to text,
              "confidence" to confidence,
              "isFinal" to true
            ))
          } else {
            currentPromise?.reject("NO_RESULT", "No transcription result", null)
          }
          
          currentPromise = null
        }

        override fun onPartialResults(partialResults: Bundle?) {
          // Not used for file transcription
        }

        override fun onEvent(eventType: Int, params: Bundle?) {
          // Not used
        }
      })

      // Note: Android's SpeechRecognizer doesn't support file-based transcription directly
      // For production, consider using Google Cloud Speech-to-Text API or
      // implementing a custom solution that plays the audio file while capturing it
      
      // For now, we'll reject with a helpful message
      promise.reject(
        "NOT_IMPLEMENTED",
        "Android file-based transcription requires additional implementation. " +
        "Consider using live recording with SpeechRecognizer.startListening() or " +
        "integrating Google Cloud Speech-to-Text API for file transcription.",
        null
      )
    }

    // Get supported languages
    AsyncFunction("getSupportedLanguagesAsync") { ->
      // Android doesn't provide a direct API to get supported languages
      // Return common languages that are typically supported
      listOf(
        "en-US", "en-GB", "es-ES", "es-MX", "fr-FR", "de-DE",
        "it-IT", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "zh-CN"
      )
    }
  }
}
