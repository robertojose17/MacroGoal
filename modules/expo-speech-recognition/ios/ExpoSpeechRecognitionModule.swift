
import ExpoModulesCore
import Speech
import AVFoundation

public class ExpoSpeechRecognitionModule: Module {
  private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
  
  public func definition() -> ModuleDefinition {
    Name("ExpoSpeechRecognition")
    
    // Request speech recognition permissions
    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      SFSpeechRecognizer.requestAuthorization { authStatus in
        DispatchQueue.main.async {
          let granted = authStatus == .authorized
          promise.resolve(["granted": granted])
        }
      }
    }
    
    // Check if speech recognition is available
    AsyncFunction("isAvailableAsync") { () -> Bool in
      return SFSpeechRecognizer.authorizationStatus() == .authorized &&
             self.speechRecognizer?.isAvailable ?? false
    }
    
    // Transcribe audio from file
    AsyncFunction("transcribeAsync") { (audioUri: String, language: String, promise: Promise) in
      // Ensure we have a valid recognizer for the specified language
      let locale = Locale(identifier: language)
      guard let recognizer = SFSpeechRecognizer(locale: locale) else {
        promise.reject("RECOGNIZER_ERROR", "Speech recognizer not available for language: \(language)")
        return
      }
      
      // Check authorization
      guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        promise.reject("PERMISSION_DENIED", "Speech recognition permission not granted")
        return
      }
      
      // Check if recognizer is available
      guard recognizer.isAvailable else {
        promise.reject("RECOGNIZER_UNAVAILABLE", "Speech recognizer is not available")
        return
      }
      
      // Convert URI to URL
      let cleanUri = audioUri.replacingOccurrences(of: "file://", with: "")
      let url = URL(fileURLWithPath: cleanUri)
      
      // Check if file exists
      guard FileManager.default.fileExists(atPath: url.path) else {
        promise.reject("FILE_NOT_FOUND", "Audio file not found at: \(url.path)")
        return
      }
      
      // Create recognition request
      let request = SFSpeechURLRecognitionRequest(url: url)
      request.shouldReportPartialResults = false
      request.taskHint = .dictation
      
      // Start recognition task
      recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
          promise.reject("TRANSCRIPTION_ERROR", "Failed to transcribe audio: \(error.localizedDescription)")
          return
        }
        
        guard let result = result else {
          promise.reject("NO_RESULT", "No transcription result received")
          return
        }
        
        // Only return final results
        if result.isFinal {
          let transcription = result.bestTranscription
          let text = transcription.formattedString
          
          // Calculate average confidence from segments
          var totalConfidence: Float = 0.0
          for segment in transcription.segments {
            totalConfidence += segment.confidence
          }
          let avgConfidence = transcription.segments.isEmpty ? 0.0 : totalConfidence / Float(transcription.segments.count)
          
          promise.resolve([
            "text": text,
            "confidence": avgConfidence,
            "isFinal": true
          ])
        }
      }
    }
    
    // Get supported languages
    AsyncFunction("getSupportedLanguagesAsync") { () -> [String] in
      return SFSpeechRecognizer.supportedLocales().map { $0.identifier }
    }
  }
}
