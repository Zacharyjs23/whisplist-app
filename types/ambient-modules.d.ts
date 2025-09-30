// Ambient module declarations to satisfy TypeScript when testing Cloud Functions
// These modules are mocked in tests and are not needed in the app bundle.
declare module 'firebase-functions' {
  const anyExport: any;
  export = anyExport;
}

declare module 'firebase-functions/params' {
  export function defineSecret(name: string): any;
}

declare module 'firebase-functions/v2/https' {
  export const onRequest: any;
}

declare module 'firebase-admin' {
  const anyExport: any;
  export = anyExport;
}

declare module 'stripe' {
  const anyExport: any;
  export = anyExport;
}

declare module 'expo-server-sdk' {
  export const Expo: any;
}

declare module 'node-fetch' {
  const anyExport: any;
  export = anyExport;
}
