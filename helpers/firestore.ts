import { collection, query, orderBy, limit, onSnapshot, addDoc, doc, updateDoc, increment, getDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Wish } from '../types/Wish';

export interface Comment {
  id: string;
  text: string;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  timestamp?: any;
  parentId?: string;
  reactions?: Record<string, number>;
  userReactions?: Record<string, string>;
  [key: string]: any;
}

export function listenTrendingWishes(cb: (wishes: Wish[]) => void) {
  const q = query(collection(db, 'wishes'), orderBy('likes', 'desc'), limit(20));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) }));
    cb(data as Wish[]);
  });
}

export function listenWishes(cb: (wishes: Wish[]) => void) {
  const q = query(collection(db, 'wishes'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) }));
    cb(data as Wish[]);
  });
}

export function listenBoostedWishes(cb: (wishes: Wish[]) => void) {
  const now = new Date();
  const q = query(
    collection(db, 'wishes'),
    where('boostedUntil', '>', now),
    orderBy('boostedUntil', 'desc')
  );
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) }));
    cb(data as Wish[]);
  });
}

export async function addWish(data: Omit<Wish, 'id'>) {
  return addDoc(collection(db, 'wishes'), {
    likes: 0,
    timestamp: serverTimestamp(),
    ...data,
  });
}

export async function likeWish(id: string) {
  const ref = doc(db, 'wishes', id);
  return updateDoc(ref, { likes: increment(1) });
}

export async function boostWish(id: string, hours: number) {
  const ref = doc(db, 'wishes', id);
  const boostedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  return updateDoc(ref, { boostedUntil });
}

export async function getWish(id: string): Promise<Wish | null> {
  const snap = await getDoc(doc(db, 'wishes', id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Wish,'id'>) } as Wish) : null;
}

export function listenWishComments(wishId: string, cb: (comments: Comment[]) => void) {
  const q = query(collection(db, 'wishes', wishId, 'comments'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Comment,'id'>) }));
    cb(data as Comment[]);
  });
}

export async function addComment(wishId: string, data: Omit<Comment, 'id'>) {
  return addDoc(collection(db, 'wishes', wishId, 'comments'), {
    timestamp: serverTimestamp(),
    ...data,
  });
}

export async function updateCommentReaction(
  wishId: string,
  commentId: string,
  emoji: string,
  prevEmoji: string | undefined,
  user: string
) {
  const ref = doc(db, 'wishes', wishId, 'comments', commentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as Comment;
  const reactions = { ...(data.reactions || {}) } as Record<string, number>;
  const userReactions = { ...(data.userReactions || {}) } as Record<string, string>;

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

  return updateDoc(ref, { reactions, userReactions });
}

export async function getWishesByNickname(nickname: string): Promise<Wish[]> {
  const snap = await getDocs(query(collection(db, 'wishes'), where('nickname', '==', nickname)));
  return snap.docs.map(d => {
    const data = d.data();
    const wish: Wish = {
      id: d.id,
      text: data.text,
      category: data.category,
      type: data.type,
      likes: data.likes,
      boostedUntil: data.boostedUntil,
      audioUrl: data.audioUrl,
      imageUrl: data.imageUrl,
      giftLink: data.giftLink,
      isPoll: data.isPoll,
      optionA: data.optionA,
      optionB: data.optionB,
      votesA: data.votesA,
      votesB: data.votesB,
    };
    return wish;
  });
}

export async function getWishesByDisplayName(displayName: string): Promise<Wish[]> {
  const q = query(
    collection(db, 'wishes'),
    where('displayName', '==', displayName),
    where('isAnonymous', '==', false),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Wish,'id'>) })) as Wish[];
}

export async function getAllWishes(): Promise<Wish[]> {
  const snap = await getDocs(collection(db, 'wishes'));
  return snap.docs.map(d => {
    const data = d.data();
    const wish: Wish = {
      id: d.id,
      text: data.text,
      category: data.category,
      type: data.type,
      likes: data.likes,
      boostedUntil: data.boostedUntil,
      audioUrl: data.audioUrl,
      imageUrl: data.imageUrl,
      giftLink: data.giftLink,
      isPoll: data.isPoll,
      optionA: data.optionA,
      optionB: data.optionB,
      votesA: data.votesA,
      votesB: data.votesB,
    };
    return wish;
  });
}

export async function getWishComments(wishId: string): Promise<Comment[]> {
  const snap = await getDocs(collection(db, 'wishes', wishId, 'comments'));
  return snap.docs.map(d => {
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
}
