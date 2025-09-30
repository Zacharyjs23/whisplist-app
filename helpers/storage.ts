import {
  uploadBytes,
  uploadBytesResumable,
  type StorageReference,
  type UploadMetadata,
  type UploadTaskSnapshot,
} from 'firebase/storage';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadBytesWithRetry(
  ref: StorageReference,
  data: Blob | Uint8Array | ArrayBuffer,
  metadata?: UploadMetadata,
  attempts = 3,
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await uploadBytes(ref, data, metadata);
    } catch (err) {
      lastErr = err;
      const backoff = 500 * Math.pow(2, i);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

export async function uploadResumableWithProgress(
  ref: StorageReference,
  data: Blob | Uint8Array | ArrayBuffer,
  metadata?: UploadMetadata,
  onProgress?: (percent: number, snap: UploadTaskSnapshot) => void,
  attempts = 2,
) {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const task = uploadBytesResumable(ref, data as any, metadata);
      const snap = await new Promise<UploadTaskSnapshot>((resolve, reject) => {
        task.on(
          'state_changed',
          (s) => {
            const pct = s.totalBytes
              ? Math.round((s.bytesTransferred / s.totalBytes) * 100)
              : 0;
            onProgress?.(pct, s);
          },
          (err) => reject(err),
          () => resolve(task.snapshot),
        );
      });
      return snap;
    } catch (err) {
      lastErr = err;
      const backoff = 400 * Math.pow(2, i);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

