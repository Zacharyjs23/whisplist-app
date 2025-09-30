import { useEffect, useMemo, useState } from 'react';
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/firebase';

export interface SupporterThanks {
  id: string;
  supporterId: string;
  supporterName: string;
  supporterAvatar?: string | null;
  wishId: string;
  wishSnippet?: string;
  amount?: number;
}

type GiftEntry = {
  id: string;
  status?: string;
  supporterId?: unknown;
  wishId?: unknown;
  amount?: unknown;
};

type UserDoc = {
  userId: string;
  displayName?: unknown;
  photoURL?: unknown;
};

type WishDoc = {
  id: string;
  text?: unknown;
};

export function useSupporterThanks(userId?: string | null) {
  const [items, setItems] = useState<SupporterThanks[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!db || !userId) {
      setItems([]);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const giftsQuery = query(
          collectionGroup(db, 'gifts'),
          where('recipientId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(5),
        );
        const snap = await getDocs(giftsQuery);
        if (!active) return;
        const supporterIds = new Set<string>();
        const wishIds = new Set<string>();
        const entries = snap.docs
          .map((docSnap) => {
            const { id: _ignored, ...rest } = (docSnap.data() as GiftEntry) ?? {};
            return { ...rest, id: docSnap.id } as GiftEntry;
          })
          .filter(
            (entry): entry is GiftEntry & { supporterId: string; wishId: string; amount?: number } =>
              entry.status === 'completed' && typeof entry.supporterId === 'string' && typeof entry.wishId === 'string',
          );
        entries.forEach((entry) => {
          supporterIds.add(entry.supporterId);
          wishIds.add(entry.wishId);
        });
        const [usersRaw, wishesRaw] = await Promise.all([
          Promise.all(
            Array.from(supporterIds).map(async (uid): Promise<UserDoc> => {
              try {
                const userSnap = await getDoc(doc(db, 'users', uid));
                if (!userSnap.exists()) {
                  return { userId: uid };
                }
                const raw = (userSnap.data() as Partial<UserDoc>) ?? {};
                const { userId: _ignored, ...rest } = raw;
                return { ...rest, userId: uid };
              } catch {
                return { userId: uid };
              }
            }),
          ),
          Promise.all(
            Array.from(wishIds).map(async (wid) => {
              try {
                const wishSnap = await getDoc(doc(db, 'wishes', wid));
                if (!wishSnap.exists()) {
                  return null;
                }
                const raw = (wishSnap.data() as Partial<WishDoc>) ?? {};
                const { id: _ignored, ...rest } = raw;
                return { ...rest, id: wid } as WishDoc;
              } catch {
                return null;
              }
            }),
          ),
        ]);

        const userMap = new Map<string, { displayName?: string | null; photoURL?: string | null }>();
        usersRaw.forEach((entry) => {
          if (entry) {
            userMap.set(entry.userId, {
              displayName: typeof entry.displayName === 'string' ? entry.displayName : undefined,
              photoURL: typeof entry.photoURL === 'string' ? entry.photoURL : undefined,
            });
          }
        });

        const wishMap = new Map<string, string>();
        wishesRaw.forEach((entry) => {
          if (entry && typeof entry.id === 'string' && typeof entry.text === 'string') {
            wishMap.set(entry.id, entry.text);
          }
        });

        const mapped: SupporterThanks[] = entries.map((entry) => {
          const supporterId = entry.supporterId;
          const wishId = entry.wishId;
          const supporter = userMap.get(supporterId);
          const wishText = wishMap.get(wishId);
          return {
            id: `${supporterId}-${wishId}-${entry.id}`,
            supporterId,
            supporterName: supporter?.displayName || 'A supporter',
            supporterAvatar: supporter?.photoURL || null,
            wishId,
            wishSnippet: wishText,
            amount: typeof entry.amount === 'number' ? entry.amount : undefined,
          };
        });

        setItems(mapped);
      } catch (err) {
        if (active) setItems([]);
        console.warn('Failed to load supporter thanks prompts', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [userId]);

  return useMemo(() => ({ items, loading }), [items, loading]);
}

export default useSupporterThanks;
