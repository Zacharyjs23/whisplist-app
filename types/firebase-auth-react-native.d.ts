export {};

declare module 'firebase/auth' {
  import type { Persistence, ReactNativeAsyncStorage } from '@firebase/auth';
  export function getReactNativePersistence(
    storage: ReactNativeAsyncStorage,
  ): Persistence;
}
