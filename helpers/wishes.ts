import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  increment,
  getDoc,
  serverTimestamp,
  getDocs,
  startAfter,
  where,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Wish } from '../types/Wish';
import { getFollowingIds } from './followers';

export interface TopCreator {
  userId: string;
  displayName: string;
  count: number;
}

export function listenTrendingWishes(cb: (wishes: Wish[]) => void) {
  const q = query(
    collection(db, 'wishes'),
    orderBy('likes', 'desc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Wish, 'id'>),
    }));
    cb(data as Wish[]);
  });
}

export function listenWishes(
  userId: string | null,
  cb: (wishes: Wish[]) => void,
) {
  const now = new Date();
  const boostedQuery = query(
    collection(db, 'wishes'),
    where('boostedUntil', '>', now),
    orderBy('boostedUntil', 'desc'),
  );

  let boosted: Wish[] = [];
  let normal: Wish[] = [];

  const unsubBoosted = onSnapshot(boostedQuery, (snap) => {
    boosted = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Wish, 'id'>),
    })) as Wish[];
    cb([...boosted, ...normal]);
  });

  let unsubNormal = () => {};

  if (userId) {
    getFollowingIds(userId).then((ids) => {
      if (ids.length === 0) {
        normal = [];
        cb([...boosted]);
        return;
      }
      const normalQuery = query(
        collection(db, 'wishes'),
        where('userId', 'in', ids),
        orderBy('timestamp', 'desc'),
      );
      unsubNormal = onSnapshot(normalQuery, (s) => {
        normal = s.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Wish, 'id'>),
        })) as Wish[];
        cb([...boosted, ...normal]);
      });
    });
  } else {
    cb([...boosted]);
  }

  return () => {
    unsubBoosted();
    unsubNormal();
  };
}

export function listenBoostedWishes(cb: (wishes: Wish[]) => void) {
  const now = new Date();
  const q = query(
    collection(db, 'wishes'),
    where('boostedUntil', '>', now),
    orderBy('boostedUntil', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Wish, 'id'>),
    }));
    cb(data as Wish[]);
  });
}

export async function getTopBoostedCreators(
  limitCount = 5,
): Promise<TopCreator[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const q = query(collection(db, 'wishes'), where('boostedUntil', '>=', since));
  const snap = await getDocs(q);
  const map: Record<string, { name: string; count: number }> = {};
  snap.forEach((d) => {
    const data = d.data() as any;
    if (!data.userId) return;
    if (!map[data.userId]) {
      map[data.userId] = { name: data.displayName || 'Anon', count: 0 };
    }
    map[data.userId].count += 1;
  });
  return Object.entries(map)
    .map(([userId, v]) => ({ userId, displayName: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limitCount);
}

export async function getWhispOfTheDay(): Promise<Wish | null> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const q = query(
    collection(db, 'wishes'),
    where('timestamp', '>', since),
    orderBy('timestamp', 'desc'),
    limit(50),
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Wish, 'id'>),
  })) as Wish[];
  const filtered = list.filter((w) => {
    const boost =
      w.boostedUntil &&
      w.boostedUntil.toDate &&
      w.boostedUntil.toDate() > new Date();
    const reacts =
      !!w.reactions &&
      Object.values(w.reactions).reduce<number>((sum, v) => sum + (v ?? 0), 0) > 0;
    return boost || reacts;
  });
  if (filtered.length === 0) return null;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export async function addWish(data: Omit<Wish, 'id'>) {
  return addDoc(collection(db, 'wishes'), {
    likes: 0,
    reactions: {
      heart: 0,
      lightbulb: 0,
      hug: 0,
      pray: 0,
    },
    timestamp: serverTimestamp(),
    ...data,
  });
}

export async function likeWish(id: string) {
  const ref = doc(db, 'wishes', id);
  return updateDoc(ref, { likes: increment(1) });
}

export async function updateWishReaction(
  id: string,
  emoji: string,
  user: string,
) {
  const wishRef = doc(db, 'wishes', id);
  const reactRef = doc(db, 'reactions', id, 'users', user);
  const snap = await getDoc(reactRef);
  const prev = snap.exists() ? snap.data().emoji : null;
  const updates: Record<string, any> = {};
  if (prev) updates[`reactions.${prev}`] = increment(-1);
  if (prev === emoji) {
    await Promise.all([deleteDoc(reactRef), updateDoc(wishRef, updates)]);
    return;
  }
  updates[`reactions.${emoji}`] = increment(1);
  await Promise.all([setDoc(reactRef, { emoji }), updateDoc(wishRef, updates)]);
}

export async function boostWish(id: string, hours: number) {
  const ref = doc(db, 'wishes', id);
  const boostedUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  return updateDoc(ref, { boostedUntil });
}

export async function createBoostCheckout(wishId: string, userId: string) {
  const resp = await fetch(
    `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/createCheckoutSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wishId, userId }),
    },
  );
  return (await resp.json()) as { url: string; sessionId: string };
}

export async function createGiftCheckout(
  wishId: string,
  amount: number,
  recipientId: string,
) {
  const resp = await fetch(
    `https://us-central1-${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/createGiftCheckoutSession`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wishId, amount, recipientId }),
    },
  );
  return (await resp.json()) as { url: string };
}

export async function setFulfillmentLink(id: string, link: string) {
  const ref = doc(db, 'wishes', id);
  return updateDoc(ref, { fulfillmentLink: link });
}

export async function getWish(id: string): Promise<Wish | null> {
  const snap = await getDoc(doc(db, 'wishes', id));
  return snap.exists()
    ? ({ id: snap.id, ...(snap.data() as Omit<Wish, 'id'>) } as Wish)
    : null;
}

export async function getWishesByNickname(nickname: string): Promise<Wish[]> {
  const snap = await getDocs(
    query(collection(db, 'wishes'), where('nickname', '==', nickname)),
  );
  return snap.docs.map((d) => {
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
      giftType: data.giftType,
      giftLabel: data.giftLabel,
      fulfillmentLink: data.fulfillmentLink,
      isPoll: data.isPoll,
      optionA: data.optionA,
      optionB: data.optionB,
      votesA: data.votesA,
      votesB: data.votesB,
    };
    return wish;
  });
}

export async function getWishesByDisplayName(
  displayName: string,
): Promise<Wish[]> {
  const q = query(
    collection(db, 'wishes'),
    where('displayName', '==', displayName),
    where('isAnonymous', '==', false),
    orderBy('timestamp', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Wish, 'id'>),
  })) as Wish[];
}

export async function getAllWishes(): Promise<Wish[]> {
  const wishes: Wish[] = [];
  let last: any = null;
  while (true) {
    const q = last
      ? query(
          collection(db, 'wishes'),
          orderBy('timestamp'),
          startAfter(last),
          limit(20),
        )
      : query(collection(db, 'wishes'), orderBy('timestamp'), limit(20));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      wishes.push({
        id: d.id,
        text: data.text,
        category: data.category,
        type: data.type,
        likes: data.likes,
        boostedUntil: data.boostedUntil,
        audioUrl: data.audioUrl,
        imageUrl: data.imageUrl,
        giftLink: data.giftLink,
        giftType: data.giftType,
        giftLabel: data.giftLabel,
        fulfillmentLink: data.fulfillmentLink,
        isPoll: data.isPoll,
        optionA: data.optionA,
        optionB: data.optionB,
        votesA: data.votesA,
        votesB: data.votesB,
      });
    });
    if (snap.docs.length < 20) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return wishes;
}

export async function cleanupExpiredWishes() {
  const now = new Date();
  const q = query(collection(db, 'wishes'), where('expiresAt', '<=', now));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

