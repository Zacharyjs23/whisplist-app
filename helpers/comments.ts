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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Comment {
  id: string;
  text: string;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  timestamp?: Timestamp | null;
  parentId?: string;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
  nickname?: string;
  [key: string]: any;
}

export function listenWishComments(
  wishId: string,
  cb: (comments: Comment[]) => void,
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
            ...(d.data() as Omit<Comment, 'id'>),
          }));
          cb(data as Comment[]);
        } catch (err) {
          console.error('Error processing wish comments snapshot', err);
          onError?.(err);
        }
      },
      (err) => {
        console.error('Error listening to wish comments', err);
        onError?.(err);
      },
    );
  } catch (err) {
    console.error('Error setting up wish comments listener', err);
    onError?.(err);
    return () => {};
  }
}

export async function addComment(
  wishId: string,
  data: Omit<Comment, 'id' | 'timestamp'>,
  onError?: (err: unknown) => void,
) {
  try {
    return await addDoc(collection(db, 'wishes', wishId, 'comments'), {
      timestamp: serverTimestamp(),
      ...data,
    });
  } catch (err) {
    console.error('Error adding comment', err);
    onError?.(err);
    throw err;
  }
}

export async function updateCommentReaction(
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
    const data = snap.data() as Comment;
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
    console.error('Error updating comment reaction', err);
    onError?.(err);
    throw err;
  }
}

export async function getWishComments(
  wishId: string,
  onError?: (err: unknown) => void,
): Promise<Comment[]> {
  try {
    const snap = await getDocs(collection(db, 'wishes', wishId, 'comments'));
    return snap.docs.map((d) => {
      const data = d.data();
      const comment: Comment = {
        id: d.id,
        text: data.text,
        nickname: data.nickname,
        timestamp: data.timestamp,
        parentId: data.parentId,
        reactions: data.reactions,
        userReactions: data.userReactions,
      };
      return comment;
    });
  } catch (err) {
    console.error('Error fetching wish comments', err);
    onError?.(err);
    throw err;
  }
}

