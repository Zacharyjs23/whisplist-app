 
// Image optimization helper with optional expo-image-manipulator support.
// If the native module is unavailable, falls back to the original URI.

export type OptimizeOptions = {
  maxWidth?: number;
  compress?: number; // 0..1
  format?: 'jpeg' | 'png';
};

type ImageManipulatorModule = typeof import('expo-image-manipulator');

declare global {
  // Allow tests to inject a mock without bundling the native module.
   
  var __expoImageManipulatorMock: ImageManipulatorModule | undefined;
}

async function loadImageManipulator(): Promise<ImageManipulatorModule | null> {
  if (typeof globalThis !== 'undefined' && globalThis.__expoImageManipulatorMock) {
    return globalThis.__expoImageManipulatorMock;
  }
  try {
    return (await import('expo-image-manipulator')) as ImageManipulatorModule;
  } catch {
    return null;
  }
}

export async function optimizeImageForUpload(
  uri: string,
  opts: OptimizeOptions = {},
): Promise<string> {
  const ImageManipulator = await loadImageManipulator();
  if (!ImageManipulator?.manipulateAsync) {
    return uri;
  }
  try {
    const maxWidth = opts.maxWidth ?? 1600;
    const requested = opts.compress ?? 0.7;
    const compress = Math.max(0, Math.min(1, requested));
    const format = (opts.format ?? 'jpeg').toUpperCase();
    type ManipulateSaveOptions = Parameters<typeof ImageManipulator.manipulateAsync>[2];
    type ManipulateSaveFormat = NonNullable<ManipulateSaveOptions>['format'];
    const formatMap: Record<'JPEG' | 'PNG', ManipulateSaveFormat | undefined> = {
      JPEG: ImageManipulator.SaveFormat?.JPEG,
      PNG: ImageManipulator.SaveFormat?.PNG,
    };
    const formatKey: 'JPEG' | 'PNG' = format === 'PNG' ? 'PNG' : 'JPEG';
    const manipFormat = formatMap[formatKey];
    const saveOptions: ManipulateSaveOptions = {
      compress,
    };
    if (manipFormat) {
      saveOptions.format = manipFormat;
    }
    const result = await ImageManipulator.manipulateAsync(
      uri,
      // Include a no-op rotate to normalize EXIF orientation on some platforms
      [{ resize: { width: maxWidth } }, { rotate: 0 }],
      saveOptions,
    );
    return result?.uri || uri;
  } catch {
    return uri;
  }
}
