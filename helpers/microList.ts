import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/firebase';
import type { MicroList } from '@/types/MicroList';
import * as logger from '@/shared/logger';

const COLLECTION = 'profiles';
const SUBCOLLECTION = 'microlist';
const DOC_ID = 'current';

function microListDocRef(userId: string) {
  return doc(db, COLLECTION, userId, SUBCOLLECTION, DOC_ID);
}

export async function fetchMicroList(
  userId: string,
): Promise<MicroList | null> {
  const ref = microListDocRef(userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as MicroList;
  const items = Array.isArray(data.items)
    ? [...data.items].sort((a, b) => a.order - b.order)
    : [];
  return {
    ...data,
    items,
  };
}

export async function saveMicroList(
  userId: string,
  next: Omit<MicroList, 'updatedAt'>,
): Promise<void> {
  try {
    const ref = microListDocRef(userId);
    await setDoc(
      ref,
      {
        ...next,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    logger.warn('Failed to persist micro list', error, {
      userId,
      severity: 'warning',
    });
    throw error;
  }
}

export function listenMicroList(
  userId: string,
  cb: (list: MicroList | null) => void,
): Unsubscribe {
  const ref = microListDocRef(userId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const data = snap.data() as MicroList;
      const items = Array.isArray(data.items)
        ? [...data.items].sort((a, b) => a.order - b.order)
        : [];
      cb({
        ...data,
        items,
      });
    },
    (error) => {
      logger.warn('Micro list listener error', error, {
        userId,
        severity: 'warning',
      });
      cb(null);
    },
  );
}
