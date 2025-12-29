
/**
 * Web implementation of local speech recognition
 * 
 * The Web Speech API is not suitable for this use case because:
 * 1. It requires user interaction to start (can't be triggered programmatically after recording)
 * 2. It doesn't work with pre-recorded audio files
 * 3. Browser support is inconsistent
 * 
 * Therefore, the microphone button should be hidden on web platforms.
 */

export async function transcribeAudioLocally(
  audioUri: string,
  onSuccess: (text: string) => void,
  onError: (error: string) => void
): Promise<void> {
  console.log('[LocalSTT Web] Web platform not supported');
  onError('Voice input is not supported on web. Please use the mobile app.');
}

export function isLocalSTTSupported(): boolean {
  return false;
}

export async function requestSpeechRecognitionPermissions(): Promise<boolean> {
  return false;
}
