import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebase';
import * as logger from '@/shared/logger';
import type { GiftInvite } from '@/types/GiftInvite';
import type { Pledge } from '@/types/Pledge';

const MAX_ENTRIES = 30;

const mapInvite = (snap: QueryDocumentSnapshot<DocumentData>): GiftInvite => {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    inviteeId: typeof data.inviteeId === 'string' ? data.inviteeId : '',
    inviteeDisplayName:
      typeof data.inviteeDisplayName === 'string'
        ? data.inviteeDisplayName
        : '',
    inviterId: typeof data.inviterId === 'string' ? data.inviterId : '',
    inviterDisplayName:
      typeof data.inviterDisplayName === 'string'
        ? data.inviterDisplayName
        : null,
    message: typeof data.message === 'string' ? data.message : null,
    status:
      typeof data.status === 'string'
        ? (data.status as GiftInvite['status'])
        : 'pending',
    createdAt: (data.createdAt as any) ?? null,
    updatedAt: (data.updatedAt as any) ?? null,
  };
};

const mapPledge = (
  wishId: string,
  snap: QueryDocumentSnapshot<DocumentData>,
): Pledge => {
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    wishId,
    uid: typeof data.uid === 'string' ? data.uid : null,
    amount: typeof data.amount === 'number' ? data.amount : 0,
    currency: typeof data.currency === 'string' ? data.currency : undefined,
    status:
      typeof data.status === 'string'
        ? (data.status as Pledge['status'])
        : 'authorized',
    paymentIntentId:
      typeof data.paymentIntentId === 'string' ? data.paymentIntentId : '',
    experimentBucket:
      typeof data.experimentBucket === 'string' ? data.experimentBucket : null,
    createdAt: (data.createdAt as any) ?? null,
    updatedAt: (data.updatedAt as any) ?? null,
    capturedAmount:
      typeof data.capturedAmount === 'number' ? data.capturedAmount : undefined,
    capturedAt: (data.capturedAt as any) ?? null,
    canceledAt: (data.canceledAt as any) ?? null,
    lastError: typeof data.lastError === 'string' ? data.lastError : null,
  };
};

export function useGiftTogetherInvites(
  wishId: string | null,
  enabled: boolean,
) {
  const [invites, setInvites] = useState<GiftInvite[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !wishId) {
      setInvites([]);
      setLoading(false);
      return () => {};
    }
    setLoading(true);
    setError(null);
    const ref = collection(db, 'wishes', wishId, 'giftInvites');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(MAX_ENTRIES));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const items = snapshot.docs.map((doc) => mapInvite(doc));
          setInvites(items);
          setLoading(false);
        } catch (err) {
          logger.warn('Failed to parse gift invites snapshot', err, { wishId });
          setInvites([]);
          setLoading(false);
          setError('Unable to load invites');
        }
      },
      (err) => {
        logger.warn('Failed to load gift invites', err, { wishId });
        setInvites([]);
        setLoading(false);
        setError('Unable to load invites');
      },
    );
    return () => unsubscribe();
  }, [enabled, wishId]);

  return { invites, loading, error };
}

export function useGiftTogetherContributors(
  wishId: string | null,
  ownerId: string | null | undefined,
  currentUserId: string | null | undefined,
) {
  const isOwner = useMemo(
    () =>
      Boolean(wishId && ownerId && currentUserId && ownerId === currentUserId),
    [wishId, ownerId, currentUserId],
  );

  const [contributors, setContributors] = useState<Pledge[]>([]);
  const [contributorsLoading, setContributorsLoading] =
    useState<boolean>(false);
  const [contributorsError, setContributorsError] = useState<string | null>(
    null,
  );

  const [myPledge, setMyPledge] = useState<Pledge | null>(null);

  useEffect(() => {
    if (!wishId || !isOwner) {
      setContributors([]);
      setContributorsLoading(false);
      return () => {};
    }
    setContributorsLoading(true);
    setContributorsError(null);
    const ref = collection(db, 'wishes', wishId, 'pledges');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(MAX_ENTRIES));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const items = snapshot.docs.map((doc) => mapPledge(wishId, doc));
          setContributors(items);
          setContributorsLoading(false);
        } catch (err) {
          logger.warn('Failed to parse pledge snapshot', err, { wishId });
          setContributors([]);
          setContributorsLoading(false);
          setContributorsError('Unable to load contributors');
        }
      },
      (err) => {
        logger.warn('Failed to load pledges', err, { wishId });
        setContributors([]);
        setContributorsLoading(false);
        setContributorsError('Unable to load contributors');
      },
    );
    return () => unsubscribe();
  }, [isOwner, wishId]);

  useEffect(() => {
    if (!wishId || !currentUserId) {
      setMyPledge(null);
      return () => {};
    }
    const ref = collection(db, 'wishes', wishId, 'pledges');
    const q = query(ref, where('uid', '==', currentUserId));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        try {
          const first = snapshot.docs[0];
          setMyPledge(first ? mapPledge(wishId, first) : null);
        } catch (err) {
          logger.warn('Failed to parse personal pledge', err, {
            wishId,
            uid: currentUserId,
          });
          setMyPledge(null);
        }
      },
      (err) => {
        logger.warn('Failed to load personal pledge', err, {
          wishId,
          uid: currentUserId,
        });
        setMyPledge(null);
      },
    );
    return () => unsubscribe();
  }, [currentUserId, wishId]);

  return {
    contributors,
    contributorsLoading,
    contributorsError,
    isOwner,
    myPledge,
  };
}
