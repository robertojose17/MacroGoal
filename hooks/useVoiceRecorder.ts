import { useState, useCallback } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';

const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';

interface UseVoiceRecorderOptions {
  onTranscription: (text: string) => void;
  onError: (message: string) => void;
}

export function useVoiceRecorder({ onTranscription, onError }: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const startRecording = useCallback(async () => {
    console.log('[useVoiceRecorder] startRecording called');
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      console.log('[useVoiceRecorder] microphone permission status:', status.granted);
      if (!status.granted) {
        onError('Microphone permission is required to record audio.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      console.log('[useVoiceRecorder] recording started');
    } catch (err) {
      console.log('[useVoiceRecorder] startRecording error:', err);
      onError('Could not start recording. Please try again.');
    }
  }, [recorder, onError]);

  const stopRecordingAndTranscribe = useCallback(async () => {
    console.log('[useVoiceRecorder] stopRecordingAndTranscribe called, isRecording:', isRecording);
    if (!isRecording) return;
    try {
      setIsRecording(false);
      await recorder.stop();
      const uri = recorder.uri;
      console.log('[useVoiceRecorder] recording stopped, uri:', uri);
      if (!uri) {
        onError('Recording failed — no audio file was created.');
        return;
      }
      setIsTranscribing(true);

      console.log('[useVoiceRecorder] sending audio to OpenRouter via URI...');

      const formData = new FormData();
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'audio.m4a',
      } as any);
      formData.append('model', 'openai/whisper-1');
      formData.append('response_format', 'json');

      const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://macro-goal.app',
          'X-Title': 'Macro Goal',
        },
        body: formData,
      });

      console.log('[useVoiceRecorder] OpenRouter response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useVoiceRecorder] OpenRouter error:', errorText);
        onError('Transcription failed. Please try again or type your description.');
        return;
      }

      const data = await response.json();
      console.log('[useVoiceRecorder] transcription result:', data.text);

      const text: string = (data.text || '').trim();
      if (!text) {
        onError('No speech detected. Please try again and speak clearly.');
        return;
      }

      onTranscription(text);
    } catch (err) {
      console.log('[useVoiceRecorder] stopRecordingAndTranscribe error:', err);
      onError('Transcription failed. Please try again.');
    } finally {
      setIsTranscribing(false);
    }
  }, [isRecording, recorder, onTranscription, onError]);

  const cancelRecording = useCallback(async () => {
    console.log('[useVoiceRecorder] cancelRecording called, isRecording:', isRecording);
    if (!isRecording) return;
    try {
      await recorder.stop();
      console.log('[useVoiceRecorder] recording cancelled');
    } catch (err) {
      // ignore
    } finally {
      setIsRecording(false);
      setIsTranscribing(false);
    }
  }, [isRecording, recorder]);

  return { isRecording, isTranscribing, startRecording, stopRecordingAndTranscribe, cancelRecording };
}
