import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  getDocs,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import * as logger from '../shared/logger';

export type Comment<
  Extra extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  text: string;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  timestamp?: Timestamp | null;
  parentId?: string | null;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
  nickname?: string;
} & Extra;

export function listenWishComments<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  wishId: string,
  cb: (comments: Comment<Extra>[]) => void,
  onError?: (err: unknown) => void,
) {
  try {
    const q = query(
      collection(db, 'wishes', wishId, 'comments'),
      orderBy('timestamp', 'asc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        try {
          const data = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Comment<Extra>, 'id'>),
          }));
          cb(data as Comment<Extra>[]);
        } catch (err) {
          logger.error('Error processing wish comments snapshot', err);
          onError?.(err);
        }
      },
      (err) => {
        logger.error('Error listening to wish comments', err);
        onError?.(err);
      },
    );
  } catch (err) {
    logger.error('Error setting up wish comments listener', err);
    onError?.(err);
    return () => {};
  }
}

export async function addComment<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  wishId: string,
  data: Omit<Comment<Extra>, 'id' | 'timestamp'>,
  onError?: (err: unknown) => void,
) {
  try {
    return await addDoc(collection(db, 'wishes', wishId, 'comments'), {
      timestamp: serverTimestamp(),
      ...data,
    });
  } catch (err) {
    logger.error('Error adding comment', err);
    onError?.(err);
    throw err;
  }
}

export async function updateComment<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  wishId: string,
  commentId: string,
  data: Partial<Omit<Comment<Extra>, 'id'>>,
  onError?: (err: unknown) => void,
) {
  try {
    const ref = doc(db, 'wishes', wishId, 'comments', commentId);
    return await updateDoc(ref, data);
  } catch (err) {
    logger.error('Error updating comment', err);
    onError?.(err);
    throw err;
  }
}

export async function deleteComment(
  wishId: string,
  commentId: string,
  onError?: (err: unknown) => void,
) {
  try {
    const ref = doc(db, 'wishes', wishId, 'comments', commentId);
    return await deleteDoc(ref);
  } catch (err) {
    logger.error('Error deleting comment', err);
    onError?.(err);
    throw err;
  }
}

export async function updateCommentReaction<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  wishId: string,
  commentId: string,
  emoji: string,
  prevEmoji: string | undefined,
  user: string,
  onError?: (err: unknown) => void,
) {
  try {
    const ref = doc(db, 'wishes', wishId, 'comments', commentId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Comment<Extra>;
    const reactions = { ...(data.reactions || {}) } as Record<string, number>;
    const userReactions = { ...(data.userReactions || {}) } as Record<
      string,
      string
    >;

    if (prevEmoji && reactions[prevEmoji]) {
      reactions[prevEmoji] -= 1;
      if (reactions[prevEmoji] === 0) delete reactions[prevEmoji];
    }

    if (prevEmoji === emoji) {
      delete userReactions[user];
    } else {
      userReactions[user] = emoji;
      reactions[emoji] = (reactions[emoji] || 0) + 1;
    }

    return await updateDoc(ref, { reactions, userReactions });
  } catch (err) {
    logger.error('Error updating comment reaction', err);
    onError?.(err);
    throw err;
  }
}

export async function getWishComments<
  Extra extends Record<string, unknown> = Record<string, unknown>,
>(
  wishId: string,
  onError?: (err: unknown) => void,
): Promise<Comment<Extra>[]> {
  try {
    const snap = await getDocs(collection(db, 'wishes', wishId, 'comments'));
    return snap.docs.map((d) => {
      const data = d.data();
      const comment = {
        id: d.id,
        text: data.text,
        nickname: data.nickname,
        timestamp: data.timestamp,
        parentId: data.parentId,
        reactions: data.reactions,
        userReactions: data.userReactions,
      } as Comment<Extra>;
      return comment;
    });
  } catch (err) {
    logger.error('Error fetching wish comments', err);
    onError?.(err);
    throw err;
  }
}

