
import { NativeModulesProxy, EventEmitter } from 'expo-modules-core';

const ExpoSpeechRecognition = NativeModulesProxy.ExpoSpeechRecognition;

export type TranscriptionResult = {
  text: string;
  confidence: number;
  isFinal: boolean;
};

export type TranscriptionError = {
  code: string;
  message: string;
};

/**
 * Request speech recognition permissions
 * iOS: Requests SFSpeechRecognizer permission
 * Android: Uses RECORD_AUDIO permission (already handled by expo-audio)
 */
export async function requestPermissionsAsync(): Promise<{ granted: boolean }> {
  if (!ExpoSpeechRecognition) {
    console.warn('[ExpoSpeechRecognition] Native module not available');
    return { granted: false };
  }

  try {
    const result = await ExpoSpeechRecognition.requestPermissionsAsync();
    return result;
  } catch (error) {
    console.error('[ExpoSpeechRecognition] Error requesting permissions:', error);
    return { granted: false };
  }
}

/**
 * Check if speech recognition is available on this device
 */
export async function isAvailableAsync(): Promise<boolean> {
  if (!ExpoSpeechRecognition) {
    return false;
  }

  try {
    const result = await ExpoSpeechRecognition.isAvailableAsync();
    return result;
  } catch (error) {
    console.error('[ExpoSpeechRecognition] Error checking availability:', error);
    return false;
  }
}

/**
 * Transcribe audio from a file URI
 * @param audioUri - Local file URI of the audio file
 * @param language - Language code (e.g., "en-US")
 * @returns Transcription result with text and confidence
 */
export async function transcribeAsync(
  audioUri: string,
  language: string = 'en-US'
): Promise<TranscriptionResult> {
  if (!ExpoSpeechRecognition) {
    throw new Error('Speech recognition is not available on this platform');
  }

  try {
    console.log('[ExpoSpeechRecognition] Starting transcription...');
    console.log('[ExpoSpeechRecognition] Audio URI:', audioUri);
    console.log('[ExpoSpeechRecognition] Language:', language);

    const result = await ExpoSpeechRecognition.transcribeAsync(audioUri, language);

    console.log('[ExpoSpeechRecognition] Transcription successful');
    console.log('[ExpoSpeechRecognition] Text:', result.text);
    console.log('[ExpoSpeechRecognition] Confidence:', result.confidence);

    return result;
  } catch (error: any) {
    console.error('[ExpoSpeechRecognition] Transcription error:', error);
    throw error;
  }
}

/**
 * Get supported languages for speech recognition
 */
export async function getSupportedLanguagesAsync(): Promise<string[]> {
  if (!ExpoSpeechRecognition) {
    return [];
  }

  try {
    const languages = await ExpoSpeechRecognition.getSupportedLanguagesAsync();
    return languages;
  } catch (error) {
    console.error('[ExpoSpeechRecognition] Error getting supported languages:', error);
    return [];
  }
}
