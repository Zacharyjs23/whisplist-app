import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Wish } from '../types/Wish';

export async function followUser(currentUser: string, targetUser: string) {
  const followerRef = doc(db, 'users', targetUser, 'followers', currentUser);
  const followingRef = doc(db, 'users', currentUser, 'following', targetUser);
  await Promise.all([
    setDoc(followerRef, { createdAt: serverTimestamp() }),
    setDoc(followingRef, { createdAt: serverTimestamp() }),
  ]);
}

export async function unfollowUser(currentUser: string, targetUser: string) {
  const followerRef = doc(db, 'users', targetUser, 'followers', currentUser);
  const followingRef = doc(db, 'users', currentUser, 'following', targetUser);
  await Promise.all([deleteDoc(followerRef), deleteDoc(followingRef)]);
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const q = query(collection(db, 'users', userId, 'following'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
}

export function listenFollowingWishes(
  userId: string,
  cb: (wishes: Wish[]) => void,
) {
  let unsub = () => {};
  getFollowingIds(userId).then((ids) => {
    if (ids.length === 0) {
      cb([]);
      return;
    }
    const q = query(
      collection(db, 'wishes'),
      where('userId', 'in', ids),
      orderBy('timestamp', 'desc'),
    );
    unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, 'id'>),
      }));
      cb(data as Wish[]);
    });
  });
  return () => unsub();
}

export async function getFollowingWishes(userId: string): Promise<Wish[]> {
  const ids = await getFollowingIds(userId);
  if (ids.length === 0) return [];
  const q = query(
    collection(db, 'wishes'),
    where('userId', 'in', ids),
    orderBy('timestamp', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Wish, 'id'>),
  })) as Wish[];
}

