import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import type { Request, Response } from 'express';

type FirestoreTimestamp = FirebaseFirestore.Timestamp;

const db = admin.firestore();

const BOOST_LIMIT = 5;
const FULFILL_LIMIT = 5;
const SUPPORTER_SAMPLE = 40;
const FULFILL_WINDOW_HOURS = 72;

interface BoostDoc {
  status?: string;
  wishId?: unknown;
  userId?: unknown;
  amount?: unknown;
  completedAt?: unknown;
  sessionId?: unknown;
}

interface WishDoc {
  text?: unknown;
  displayName?: unknown;
  fulfilledAt?: unknown;
  fulfillmentLink?: unknown;
}

interface GiftDoc {
  status?: string;
  supporterId?: unknown;
  wishId?: unknown;
  amount?: unknown;
}

type BoostPulseResponse = {
  id: string;
  wishId: string;
  wishText?: string;
  wishOwnerName?: string;
  boosterId: string;
  boosterName?: string;
  amount?: number;
  completedAt?: string;
};

type FulfillmentPulseResponse = {
  wishId: string;
  wishText?: string;
  wishOwnerName?: string;
  fulfilledAt?: string;
  fulfillmentLink?: string | null;
};

type SupporterPulseResponse = {
  userId: string;
  displayName?: string;
  avatar?: string | null;
  totalGifts: number;
  totalAmount: number;
};

const isFirestoreTimestamp = (value: unknown): value is FirestoreTimestamp =>
  value instanceof admin.firestore.Timestamp;

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (isFirestoreTimestamp(value)) return value.toDate();
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch (err) {
      functions.logger.warn('Failed to convert timestamp via toDate', err);
      return null;
    }
  }
  return null;
};

const toIsoString = (value: unknown): string | undefined => {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
};

type CommunityPulsePayload = {
  boosts: BoostPulseResponse[];
  fulfillments: FulfillmentPulseResponse[];
  supporters: SupporterPulseResponse[];
  generatedAt: string;
};

const loadCommunityPulse = async (): Promise<CommunityPulsePayload> => {
  const fulfillWindow = new Date(Date.now() - FULFILL_WINDOW_HOURS * 60 * 60 * 1000);
  const fulfillWindowTimestamp = admin.firestore.Timestamp.fromDate(fulfillWindow);

  const [boostSnap, fulfillSnap, giftSnap] = await Promise.all([
    db
      .collection('boostPayments')
      .orderBy('completedAt', 'desc')
      .limit(BOOST_LIMIT * 3)
      .get(),
    db
      .collection('wishes')
      .where('fulfilledAt', '>=', fulfillWindowTimestamp)
      .orderBy('fulfilledAt', 'desc')
      .limit(FULFILL_LIMIT * 2)
      .get(),
    db
      .collectionGroup('gifts')
      .orderBy('completedAt', 'desc')
      .limit(SUPPORTER_SAMPLE)
      .get(),
  ]);

  const boostEntries = boostSnap.docs
    .map((docSnap: FirebaseFirestore.QueryDocumentSnapshot<BoostDoc>) => ({
      id: docSnap.id,
      ...(docSnap.data() ?? {}),
    }))
    .filter(
      (entry: BoostDoc & { id: string }): entry is BoostDoc & { id: string; wishId: string; userId: string } =>
        entry.status === 'completed' && typeof entry.wishId === 'string' && typeof entry.userId === 'string',
    );

  const fulfilledEntries = fulfillSnap.docs.map(
    (docSnap: FirebaseFirestore.QueryDocumentSnapshot<WishDoc>) => ({
      id: docSnap.id,
      ...(docSnap.data() ?? {}),
    }),
  );

  const giftEntries = giftSnap.docs
    .map((docSnap: FirebaseFirestore.QueryDocumentSnapshot<GiftDoc>) => ({
      id: docSnap.id,
      ...(docSnap.data() ?? {}),
    }))
    .filter(
      (entry: GiftDoc & { id: string }): entry is GiftDoc & { id: string; supporterId: string } =>
        entry.status === 'completed' && typeof entry.supporterId === 'string',
    );

  const wishIds = new Set<string>();
  const userIds = new Set<string>();

  boostEntries.forEach((entry: BoostDoc & { id: string; wishId: string; userId: string }) => {
    wishIds.add(String(entry.wishId));
    userIds.add(String(entry.userId));
  });

  fulfilledEntries.forEach((entry: WishDoc & { id: string }) => {
    wishIds.add(String(entry.id));
  });

  giftEntries.forEach((entry: GiftDoc & { id: string; supporterId: string }) => {
    if (typeof entry.wishId === 'string') wishIds.add(entry.wishId);
    userIds.add(entry.supporterId);
  });

  const wishRefs = Array.from(wishIds).map((id) => db.collection('wishes').doc(id));
  const userRefs = Array.from(userIds).map((uid) => db.collection('users').doc(uid));

  const wishSnaps = (wishRefs.length
    ? await db.getAll(...wishRefs)
    : []) as FirebaseFirestore.DocumentSnapshot<WishDoc>[];
  const userSnaps = (userRefs.length
    ? await db.getAll(...userRefs)
    : []) as FirebaseFirestore.DocumentSnapshot<{ displayName?: unknown; photoURL?: unknown }>[];

  const wishMap = new Map<string, WishDoc & { id: string }>();
  wishSnaps.forEach((snap: FirebaseFirestore.DocumentSnapshot<WishDoc>) => {
    if (snap.exists) {
      wishMap.set(snap.id, { id: snap.id, ...(snap.data() as WishDoc) });
    }
  });

  const userMap = new Map<string, { displayName?: string; photoURL?: string | null }>();
  userSnaps.forEach((snap: FirebaseFirestore.DocumentSnapshot<{ displayName?: unknown; photoURL?: unknown }>) => {
    if (snap.exists) {
      const data = snap.data() as { displayName?: unknown; photoURL?: unknown };
      userMap.set(snap.id, {
        displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
      });
    }
  });

  const boosts: BoostPulseResponse[] = boostEntries.slice(0, BOOST_LIMIT).map((entry: BoostDoc & {
    id: string;
    wishId: string;
    userId: string;
  }) => {
    const wish = wishMap.get(String(entry.wishId));
    const booster = userMap.get(String(entry.userId));
    const id = String(entry.id || entry.sessionId || `${entry.wishId}-${entry.userId}`);
    return {
      id,
      wishId: String(entry.wishId),
      wishText: typeof wish?.text === 'string' ? (wish.text as string) : undefined,
      wishOwnerName: typeof wish?.displayName === 'string' ? (wish.displayName as string) : undefined,
      boosterId: String(entry.userId),
      boosterName: booster?.displayName,
      amount: typeof entry.amount === 'number' ? entry.amount : undefined,
      completedAt: toIsoString(entry.completedAt),
    };
  });

  const fulfillments: FulfillmentPulseResponse[] = fulfilledEntries
    .slice(0, FULFILL_LIMIT)
    .map((wish: WishDoc & { id: string }) => ({
      wishId: wish.id,
      wishText: typeof wish.text === 'string' ? (wish.text as string) : undefined,
      wishOwnerName: typeof wish.displayName === 'string' ? (wish.displayName as string) : undefined,
      fulfilledAt: toIsoString(wish.fulfilledAt),
      fulfillmentLink:
        typeof wish.fulfillmentLink === 'string' || wish.fulfillmentLink === null
          ? (wish.fulfillmentLink as string | null)
          : undefined,
    }));

  const supporterAggregate = new Map<string, { totalAmount: number; totalGifts: number }>();
  giftEntries.forEach((entry: GiftDoc & { id: string; supporterId: string }) => {
    const supporterId = entry.supporterId;
    const stats = supporterAggregate.get(supporterId) || { totalAmount: 0, totalGifts: 0 };
    stats.totalGifts += 1;
    if (typeof entry.amount === 'number') {
      stats.totalAmount += entry.amount;
    }
    supporterAggregate.set(supporterId, stats);
  });

  const supporters: SupporterPulseResponse[] = Array.from(supporterAggregate.entries())
    .map(([userId, stats]) => {
      const user = userMap.get(userId);
      return {
        userId,
        displayName: user?.displayName,
        avatar: user?.photoURL ?? null,
        totalGifts: stats.totalGifts,
        totalAmount: Number(stats.totalAmount.toFixed(2)),
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount || b.totalGifts - a.totalGifts)
    .slice(0, 3);

  return {
    boosts,
    fulfillments,
    supporters,
    generatedAt: new Date().toISOString(),
  };
};

const { https } = functions;
const { HttpsError } = https;

export const getCommunityPulse = https.onCall(async (_data: unknown, context: any) => {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    return await loadCommunityPulse();
  } catch (err) {
    functions.logger.error('Failed to load community pulse', err);
    throw new HttpsError('internal', 'Failed to load community pulse');
  }
});

const applyCors = (req: Request, res: Response): void => {
  const origin = req.get('Origin');
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
  } else {
    res.set('Access-Control-Allow-Origin', '*');
  }
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Max-Age', '3600');
};

const extractBearerToken = (header?: string | null): string | null => {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.*)$/i);
  return match ? match[1]?.trim() ?? null : null;
};

export const getCommunityPulseHttp = https.onRequest(async (req: Request, res: Response) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = extractBearerToken(req.get('Authorization'));
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    await admin.auth().verifyIdToken(token);
  } catch (err) {
    functions.logger.warn('Invalid token for community pulse request', err);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const payload = await loadCommunityPulse();
    res.status(200).json(payload);
  } catch (err) {
    functions.logger.error('Failed to load community pulse (HTTP)', err);
    res.status(500).json({ error: 'Internal error' });
  }
});
