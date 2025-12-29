
/**
 * Local Speech Recognition Utility
 * 
 * This module provides on-device speech-to-text functionality for the AI chatbot.
 * It uses platform-specific implementations:
 * 
 * - iOS/Android: Native speech recognition APIs (placeholder for now)
 * - Web: Not supported (mic button hidden)
 * 
 * IMPLEMENTATION STATUS:
 * This is currently a placeholder implementation that provides graceful error handling.
 * 
 * To implement full local STT functionality:
 * 
 * 1. Create a native module using expo-modules-core:
 *    - iOS: Implement Speech framework (SFSpeechRecognizer)
 *    - Android: Implement SpeechRecognizer API
 * 
 * 2. Handle permissions:
 *    - iOS: Request speech recognition permission
 *    - Android: Use existing RECORD_AUDIO permission
 * 
 * 3. Process audio files:
 *    - Convert recorded audio to format required by native APIs
 *    - Force language to "en-US" for English-only transcription
 *    - Handle errors and edge cases gracefully
 * 
 * 4. Alternative approaches:
 *    - Use a lightweight local Whisper model (whisper.cpp)
 *    - Integrate a third-party React Native STT library
 *    - Create a self-hosted Whisper API endpoint
 */

import { Platform } from 'react-native';

// Platform-specific implementations
let platformImplementation: {
  transcribeAudioLocally: (
    audioUri: string,
    onSuccess: (text: string) => void,
    onError: (error: string) => void
  ) => Promise<void>;
  isLocalSTTSupported: () => boolean;
  requestSpeechRecognitionPermissions: () => Promise<boolean>;
};

if (Platform.OS === 'web') {
  // Dynamic import for web platform
  platformImplementation = require('./localSpeechRecognition.web') as typeof platformImplementation;
} else {
  // Dynamic import for native platforms
  platformImplementation = require('./localSpeechRecognition.native') as typeof platformImplementation;
}

export const transcribeAudioLocally = platformImplementation.transcribeAudioLocally;
export const isLocalSTTSupported = platformImplementation.isLocalSTTSupported;
export const requestSpeechRecognitionPermissions = platformImplementation.requestSpeechRecognitionPermissions;

/**
 * Check if the microphone button should be shown
 * Only show on mobile platforms where STT could potentially work
 */
export function shouldShowMicButton(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
