declare module 'expo-audio' {
  export type AudioRecorder = {
    start: () => Promise<void>;
    stop: () => Promise<{ uri: string }>;
  };
  export type AudioPlayer = {
    loadAsync: (uri: string) => Promise<void>;
    playAsync: () => Promise<void>;
    pauseAsync: () => Promise<void>;
  };
  export const createRecorder: () => AudioRecorder;
  export const createPlayer: () => AudioPlayer;
  export const requestRecordingPermissionsAsync: () => Promise<{ granted: boolean; status?: string }>;
  export const getRecordingPermissionsAsync: () => Promise<{ granted: boolean; status?: string }>;
  export const setAudioModeAsync: (options: any) => Promise<void>;
  export const RecordingPresets: Record<string, any>;
}
