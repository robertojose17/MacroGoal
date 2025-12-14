
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Import the native module
let ExpoSpeechRecognition: any = null;

try {
  // Try to import the native module
  ExpoSpeechRecognition = require('../modules/expo-speech-recognition/src/index');
  console.log('[LocalSTT] Native speech recognition module loaded successfully');
} catch (error) {
  console.warn('[LocalSTT] Native speech recognition module not available:', error);
}

/**
 * Native implementation of local speech recognition for iOS and Android
 * 
 * This implementation uses the native speech recognition APIs:
 * - iOS: Speech framework (SFSpeechRecognizer)
 * - Android: SpeechRecognizer API
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Install the native module:
 *    - The module is located in modules/expo-speech-recognition
 *    - Run: npx expo prebuild
 *    - This will link the native module to your project
 * 
 * 2. iOS Setup:
 *    - Add to Info.plist:
 *      <key>NSSpeechRecognitionUsageDescription</key>
 *      <string>We need access to speech recognition to transcribe your voice input</string>
 *    - The Speech framework is automatically linked
 * 
 * 3. Android Setup:
 *    - RECORD_AUDIO permission is already handled by expo-audio
 *    - No additional setup required
 * 
 * 4. Build the app:
 *    npx expo run:ios
 *    npx expo run:android
 */

export async function transcribeAudioLocally(
  audioUri: string,
  onSuccess: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  console.log('[LocalSTT] Starting local transcription');
  console.log('[LocalSTT] Platform:', Platform.OS);
  console.log('[LocalSTT] Audio URI:', audioUri);

  try {
    // Check if native module is available
    if (!ExpoSpeechRecognition) {
      console.error('[LocalSTT] Native module not available');
      onError(
        'Voice transcription requires a native build. ' +
        'Please run: npx expo prebuild && npx expo run:' + Platform.OS
      );
      return;
    }

    // Verify the audio file exists and has content
    const fileInfo = await FileSystem.getInfoAsync(audioUri);
    
    if (!fileInfo.exists) {
      console.error('[LocalSTT] Audio file does not exist');
      onError('Audio file not found. Please try recording again.');
      return;
    }

    console.log('[LocalSTT] Audio file size:', fileInfo.size, 'bytes');

    // Check if file is too small (likely empty or corrupted)
    if (fileInfo.size < 1000) {
      console.error('[LocalSTT] Audio file too small');
      onError('Recording is too short. Please speak for at least 1 second.');
      return;
    }

    // Check if speech recognition is available
    const isAvailable = await ExpoSpeechRecognition.isAvailableAsync();
    if (!isAvailable) {
      console.error('[LocalSTT] Speech recognition not available');
      onError('Speech recognition is not available on this device.');
      return;
    }

    // Request permissions
    const { granted } = await ExpoSpeechRecognition.requestPermissionsAsync();
    if (!granted) {
      console.error('[LocalSTT] Speech recognition permission denied');
      onError('Speech recognition permission is required. Please enable it in Settings.');
      return;
    }

    console.log('[LocalSTT] Starting transcription with native module...');

    // Transcribe the audio file
    const result = await ExpoSpeechRecognition.transcribeAsync(audioUri, 'en-US');

    if (result && result.text) {
      console.log('[LocalSTT] ✅ Transcription successful:', result.text);
      console.log('[LocalSTT] Confidence:', result.confidence);
      
      // Return the transcribed text
      onSuccess(result.text);
    } else {
      console.error('[LocalSTT] No transcription result');
      onError('Could not transcribe audio. Please try again.');
    }

  } catch (error: any) {
    console.error('[LocalSTT] Error during transcription:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to transcribe audio. Please try again.';
    
    if (error.code === 'PERMISSION_DENIED') {
      errorMessage = 'Speech recognition permission is required. Please enable it in Settings.';
    } else if (error.code === 'RECOGNIZER_UNAVAILABLE') {
      errorMessage = 'Speech recognition is temporarily unavailable. Please try again.';
    } else if (error.code === 'FILE_NOT_FOUND') {
      errorMessage = 'Audio file not found. Please try recording again.';
    } else if (error.code === 'NO_RESULT') {
      errorMessage = 'Could not understand the audio. Please speak clearly and try again.';
    } else if (error.code === 'NOT_IMPLEMENTED') {
      // Android file-based transcription limitation
      errorMessage = 'Voice transcription is not yet fully supported on Android. Please use text or photo input.';
    }
    
    onError(errorMessage);
  }
}

/**
 * Check if local STT is supported on this device
 */
export function isLocalSTTSupported(): boolean {
  if (!ExpoSpeechRecognition) {
    return false;
  }
  
  // This is a synchronous check, actual availability is checked async in transcribeAudioLocally
  return true;
}

/**
 * Request speech recognition permissions
 */
export async function requestSpeechRecognitionPermissions(): Promise<boolean> {
  console.log('[LocalSTT] Checking speech recognition permissions');
  
  if (!ExpoSpeechRecognition) {
    console.warn('[LocalSTT] Native module not available');
    return false;
  }
  
  try {
    const { granted } = await ExpoSpeechRecognition.requestPermissionsAsync();
    return granted;
  } catch (error) {
    console.error('[LocalSTT] Error requesting permissions:', error);
    return false;
  }
}
