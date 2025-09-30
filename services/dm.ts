import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase';

export type DMThread = {
  participants: string[];
  updatedAt: Timestamp | ReturnType<typeof serverTimestamp>;
  lastMessage?: string;
  lastSender?: string;
  readReceipts?: Record<string, Timestamp | ReturnType<typeof serverTimestamp>>;
};

export type DMMessage = {
  senderId: string;
  text?: string;
  imageUrl?: string;
  replyToId?: string;
  replyToSenderId?: string;
  replyToText?: string;
  replyToImageUrl?: string;
  timestamp: Timestamp | ReturnType<typeof serverTimestamp>;
};

export type DMThreadWithId = DMThread & { id: string };
export type DMMessageWithId = DMMessage & { id: string };

export function threadIdFor(a: string, b: string) {
  return [a, b].sort().join('_');
}

export async function getOrCreateThread(currentUid: string, otherUid: string) {
  if (!db) throw new Error('Firestore not initialized');
  const id = threadIdFor(currentUid, otherUid);
  const ref = doc(db, 'dmThreads', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      participants: [currentUid, otherUid],
      updatedAt: serverTimestamp(),
      readReceipts: { [currentUid]: serverTimestamp() },
    } as DMThread);
  }
  return id;
}

export async function sendMessage(
  threadId: string,
  senderId: string,
  text: string,
  imageUrl?: string,
  reply?: { id: string; senderId: string; text?: string; imageUrl?: string },
) {
  if (!db) throw new Error('Firestore not initialized');
  const messagesRef = collection(db, 'dmThreads', threadId, 'messages');
  await addDoc(messagesRef, {
    senderId,
    ...(text ? { text } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(reply
      ? {
          replyToId: reply.id,
          replyToSenderId: reply.senderId,
          ...(reply.text ? { replyToText: reply.text } : {}),
          ...(reply.imageUrl ? { replyToImageUrl: reply.imageUrl } : {}),
        }
      : {}),
    timestamp: serverTimestamp(),
  } as DMMessage);
  await updateDoc(doc(db, 'dmThreads', threadId), {
    lastMessage: text || (imageUrl ? '[photo]' : reply?.text ? `↩︎ ${reply.text}` : ''),
    lastSender: senderId,
    updatedAt: serverTimestamp(),
  });
}

export function listenThreads(
  uid: string,
  cb: (threads: DMThreadWithId[]) => void,
) {
  if (!db) throw new Error('Firestore not initialized');
  const q = query(
    collection(db, 'dmThreads'),
    where('participants', 'array-contains', uid),
    orderBy('updatedAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DMThread) })));
  });
}

export function listenMessages(
  threadId: string,
  cb: (messages: DMMessageWithId[]) => void,
) {
  if (!db) throw new Error('Firestore not initialized');
  const q = query(
    collection(db, 'dmThreads', threadId, 'messages'),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DMMessage) })));
  });
}

export async function markThreadRead(threadId: string, uid: string) {
  if (!db) throw new Error('Firestore not initialized');
  await updateDoc(doc(db, 'dmThreads', threadId), {
    [`readReceipts.${uid}`]: serverTimestamp(),
  });
}

export async function findUserIdByDisplayName(displayName: string) {
  if (!db) throw new Error('Firestore not initialized');
  const q = query(
    collection(db, 'users'),
    where('displayName', '==', displayName),
  );
  const snap = await getDocs(q);
  return snap.docs[0]?.id as string | undefined;
}

// Typing indicators
export async function setTyping(threadId: string, uid: string, typing: boolean) {
  if (!db) throw new Error('Firestore not initialized');
  const ref = doc(db, 'dmThreads', threadId, 'typing', uid);
  await setDoc(ref, { typing, updatedAt: serverTimestamp() }, { merge: true });
}

export function listenTyping(
  threadId: string,
  cb: (map: Record<string, { typing: boolean; updatedAt?: Timestamp }>) => void,
) {
  if (!db) throw new Error('Firestore not initialized');
  const ref = collection(db, 'dmThreads', threadId, 'typing');
  return onSnapshot(ref, (snap) => {
    const m: Record<string, { typing: boolean; updatedAt?: Timestamp }> = {};
    snap.forEach((d) => {
      const data = d.data() as any;
      m[d.id] = { typing: !!data?.typing, updatedAt: data?.updatedAt };
    });
    cb(m);
  });
}
