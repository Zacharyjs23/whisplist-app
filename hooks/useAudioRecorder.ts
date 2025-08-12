import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { createRecorder, type AudioRecorder } from 'expo-audio';
import * as ExpoAudio from 'expo-audio';
import * as logger from '@/shared/logger';

export const useAudioRecorder = () => {
  const [recording, setRecording] = useState<AudioRecorder | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);

  useEffect(() => {
    return () => {
      if (recording) {
        recording
          .stop()
          .catch((err) => logger.warn('Failed to stop recording on unmount', err));
        setRecording(null);
        setRecordedUri(null);
        setIsRecording(false);
        setIncludeAudio(false);
      }
    };
  }, [recording]);

  const startRecording = async () => {
    try {
      const { granted } = await (ExpoAudio as any).requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission required', 'Microphone access is needed to record');
        return;
      }
      await (ExpoAudio as any).setAudioModeAsync({
        allowsRecording: true,
        interruptionMode: (ExpoAudio as any).INTERRUPTION_MODE_IOS_DO_NOT_MIX,
        playsInSilentMode: true,
        interruptionModeAndroid: (ExpoAudio as any).INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      const rec = createRecorder();
      await rec.start();
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      logger.error('❌ Failed to start recording:', err);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;
      const { uri } = await recording.stop();
      setRecordedUri(uri);
    } catch (err) {
      logger.error('❌ Failed to stop recording:', err);
    } finally {
      setIsRecording(false);
      setRecording(null);
    }
  };

  const reset = () => {
    setRecording(null);
    setRecordedUri(null);
    setIsRecording(false);
    setIncludeAudio(false);
  };

  return {
    recording,
    recordedUri,
    isRecording,
    includeAudio,
    setIncludeAudio,
    startRecording,
    stopRecording,
    reset,
  };
};

export default useAudioRecorder;
