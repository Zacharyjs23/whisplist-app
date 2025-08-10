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
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Wish } from '../types/Wish';
import * as logger from '../shared/logger';

const converter: FirestoreDataConverter<Wish> = {
  toFirestore: ({ id, ...wish }: Wish) => wish,
  fromFirestore: (
    snapshot: QueryDocumentSnapshot,
  ): Wish =>
    ({ id: snapshot.id, ...(snapshot.data() as Omit<Wish, 'id'>) } as Wish),
};

/**
 * Firestore `in` queries only accept up to 10 values. This helper splits an
 * array into chunks so we can query in batches that respect this limit.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function followUser(currentUser: string, targetUser: string) {
  const followerRef = doc(db, 'users', targetUser, 'followers', currentUser);
  const followingRef = doc(db, 'users', currentUser, 'following', targetUser);
  try {
    await Promise.all([
      setDoc(followerRef, { createdAt: serverTimestamp() }),
      setDoc(followingRef, { createdAt: serverTimestamp() }),
    ]);
  } catch (error) {
    logger.error('Error following user', error);
    throw error;
  }
}

export async function unfollowUser(currentUser: string, targetUser: string) {
  const followerRef = doc(db, 'users', targetUser, 'followers', currentUser);
  const followingRef = doc(db, 'users', currentUser, 'following', targetUser);
  try {
    await Promise.all([deleteDoc(followerRef), deleteDoc(followingRef)]);
  } catch (error) {
    logger.error('Error unfollowing user', error);
    throw error;
  }
}

export async function getFollowingIds(userId: string): Promise<string[]> {
  const q = query(collection(db, 'users', userId, 'following'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.id);
}

export function listenFollowingWishes(
  userId: string,
  cb: (wishes: Wish[]) => void,
  onError?: (err: unknown) => void,
) {
  const unsubs: (() => void)[] = [];
  (async () => {
    try {
      const ids = await getFollowingIds(userId);
      if (ids.length === 0) {
        cb([]);
        return;
      }
      // Firestore `in` queries can include at most 10 IDs, so we query each chunk separately.
      const chunks = chunkArray(ids, 10);
      const chunkResults: Wish[][] = chunks.map(() => []);
      chunks.forEach((chunk, index) => {
        const q = query(
          collection(db, 'wishes'),
          where('userId', 'in', chunk),
          orderBy('timestamp', 'desc'),
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            try {
              chunkResults[index] = snap.docs.map((d) =>
                converter.fromFirestore(d),
              );
              const merged = chunkResults
                .flat()
                .sort(
                  (a, b) =>
                    (b.timestamp?.toMillis() ?? 0) -
                    (a.timestamp?.toMillis() ?? 0),
                );
              cb(merged);
            } catch (err) {
              logger.error('Error processing following wishes snapshot', err);
              onError?.(err);
            }
          },
          (err) => {
            logger.error('Error listening to following wishes', err);
            onError?.(err);
          },
        );
        unsubs.push(unsub);
      });
    } catch (err) {
      logger.error('Error fetching following ids', err);
      onError?.(err);
    }
  })();
  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function getFollowingWishes(userId: string): Promise<Wish[]> {
  try {
    const ids = await getFollowingIds(userId);
    if (ids.length === 0) return [];
    // Firestore `in` queries are limited to 10 IDs; fetch each chunk and merge results.
    const chunks = chunkArray(ids, 10);
    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, 'wishes'),
            where('userId', 'in', chunk),
            orderBy('timestamp', 'desc'),
            limit(20),
          ),
        ),
      ),
    );
    const wishes = snaps.flatMap((snap) =>
      snap.docs.map((d) => converter.fromFirestore(d)),
    );
    return wishes
      .sort(
        (a, b) =>
          (b.timestamp?.toMillis() ?? 0) - (a.timestamp?.toMillis() ?? 0),
      )
      .slice(0, 20);
  } catch (error) {
    logger.error('Error getting following wishes', error);
    throw error;
  }
}

