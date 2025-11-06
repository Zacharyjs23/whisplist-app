import {
  config as functionsConfig,
  firestore,
  logger,
  pubsub,
  region,
  runWith,
} from 'firebase-functions/v1';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { createHmac, randomUUID } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { backfillPostTypes } from './backfillPostTypes';
import { incrementEngagement } from './engagement';
import { sendPush } from './notifications';
// Use Cloud Functions logger for server-side logs

let cachedRuntimeConfig: Record<string, any> | null = null;

function readRuntimeConfig(): Record<string, any> {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;
  try {
    cachedRuntimeConfig =
      typeof functionsConfig === 'function' ? functionsConfig() ?? {} : {};
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('functions.config() is no longer available')) {
      cachedRuntimeConfig = {};
    } else {
      throw err;
    }
  }
  return cachedRuntimeConfig;
}

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const GIFT_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_GIFT_AMOUNT = 10_000;

type GiftTokenPayload = {
  giftId: string;
  wishId: string;
  tokenId: string;
  amount: number;
  exp: number;
};

type GiftStartBody = {
  wishId?: unknown;
  amount?: unknown;
  variant?: unknown;
  userId?: unknown;
  platform?: unknown;
};

type GiftConfirmBody = {
  token?: unknown;
};

type GiftConfig = {
  secret: string;
  venmoHandle: string;
};

let cachedGiftConfig: GiftConfig | null = null;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? `${normalized}${'='.repeat(4 - pad)}` : normalized;
  return Buffer.from(padded, 'base64');
}

function getGiftConfig(): GiftConfig {
  if (cachedGiftConfig) return cachedGiftConfig;
  const cfg = readRuntimeConfig();
  const secret =
    cfg?.gifts?.secret || process.env.GIFT_TOKEN_SECRET || undefined;
  if (!secret) {
    throw new Error(
      'Gift token secret not configured. Set functions.config().gifts.secret or GIFT_TOKEN_SECRET.',
    );
  }
  const venmoHandle =
    cfg?.gifts?.venmo_handle ||
    cfg?.gifts?.venmo ||
    process.env.GIFT_VENMO_HANDLE ||
    'whisplist';
  cachedGiftConfig = { secret, venmoHandle };
  return cachedGiftConfig;
}

function signGiftToken(payload: GiftTokenPayload): string {
  const { secret } = getGiftConfig();
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(encodedPayload)
    .digest();
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

function verifyGiftToken(token: string): GiftTokenPayload {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new Error('malformed_token');
  }
  const expectedSignature = base64UrlEncode(
    createHmac('sha256', getGiftConfig().secret)
      .update(encodedPayload)
      .digest(),
  );
  if (signature !== expectedSignature) {
    throw new Error('signature_mismatch');
  }
  const decoded = base64UrlDecode(encodedPayload).toString('utf8');
  const payload = JSON.parse(decoded) as GiftTokenPayload;
  if (
    !payload.giftId ||
    !payload.tokenId ||
    !payload.wishId ||
    typeof payload.amount !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('invalid_payload');
  }
  return payload;
}

function sanitizeAmount(input: unknown): number | null {
  const amount = typeof input === 'string' ? Number(input) : Number(input);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0 || amount > MAX_GIFT_AMOUNT) return null;
  return Math.round(amount * 100) / 100;
}

function truncateTitle(title: unknown): string {
  const raw =
    typeof title === 'string' && title.trim().length ? title.trim() : 'Wish';
  return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
}

function buildVenmoNote(title: unknown, amount: number): string {
  return `Support "${truncateTitle(title)}" on WhispList – $${amount.toFixed(2)}`;
}

function applyCors(res: Response) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function extractBearerToken(header?: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function giftStartHandler(req: Request, res: Response) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = (req.body || {}) as GiftStartBody;
  const wishId = typeof body.wishId === 'string' ? body.wishId : null;
  const amount = sanitizeAmount(body.amount);
  if (!wishId || amount === null) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  try {
    const wishRef = db.collection('wishes').doc(wishId);
    const wishSnap = await wishRef.get();
    if (!wishSnap.exists) {
      res.status(404).json({ error: 'wish_not_found' });
      return;
    }
    const wish = wishSnap.data() ?? {};
    const recipientId =
      typeof wish.userId === 'string' ? (wish.userId as string) : null;
    if (!recipientId) {
      res.status(400).json({ error: 'missing_recipient' });
      return;
    }
    const isPrivate =
      wish.visibility === 'private' ||
      wish.shareScope === 'private' ||
      wish.isPrivate === true;
    if (isPrivate) {
      res.status(403).json({ error: 'wish_private' });
      return;
    }
    const supporterId =
      typeof body.userId === 'string' && body.userId ? body.userId : null;
    const note = buildVenmoNote(wish.title ?? wish.text, amount);

    let venmoHandle = getGiftConfig().venmoHandle;
    try {
      const ownerSnap = await db.collection('users').doc(recipientId).get();
      const ownerHandle = ownerSnap.exists
        ? ownerSnap.get('venmoHandle')
        : null;
      if (typeof ownerHandle === 'string' && ownerHandle.trim()) {
        venmoHandle = ownerHandle.replace(/^@/, '').trim();
      }
    } catch (err) {
    logger.warn('Unable to resolve owner Venmo handle', err, {
        recipientId,
      });
    }

    const giftId = randomUUID();
    const tokenId = randomUUID();
    const expiresAt = Date.now() + GIFT_TOKEN_TTL_MS;
    const token = signGiftToken({
      giftId,
      wishId,
      tokenId,
      amount,
      exp: expiresAt,
    });

    await db
      .collection('gifts')
      .doc(giftId)
      .set({
        wishId,
        amount,
        supporterId,
        recipientId,
        variant: 'venmo',
        status: 'pending',
        tokenId,
        note,
        venmoRecipient: venmoHandle,
        platform: typeof body.platform === 'string' ? body.platform : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt),
      });

    res.json({
      token,
      giftId,
      amount,
      note,
      recipient: venmoHandle,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (err) {
    logger.error('startGift failed', err, { wishId });
    res.status(500).json({ error: 'internal' });
  }
}

async function giftConfirmHandler(req: Request, res: Response) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = (req.body || {}) as GiftConfirmBody;
  const token = typeof body.token === 'string' ? body.token : null;
  if (!token) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  let payload: GiftTokenPayload;
  try {
    payload = verifyGiftToken(token);
  } catch (err) {
    logger.warn('Token verification failed', err);
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  const now = Date.now();
  if (now > payload.exp) {
    try {
      await db.collection('gifts').doc(payload.giftId).set(
        {
          status: 'expired',
          expiredAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      logger.warn('Failed to mark gift expired', err, {
        giftId: payload.giftId,
      });
    }
    res.status(410).json({ error: 'token_expired' });
    return;
  }

  try {
    const giftRef = db.collection('gifts').doc(payload.giftId);
    const wishRef = db.collection('wishes').doc(payload.wishId);
    const legacyRef = db
      .collection('gifts')
      .doc(payload.wishId)
      .collection('gifts')
      .doc(payload.giftId);
    const wishGiftRef = wishRef.collection('gifts').doc(payload.giftId);

    const result = await db.runTransaction(
      async (tx: FirebaseFirestore.Transaction) => {
        const giftSnap = (await tx.get(giftRef)) as unknown as DocumentSnapshot;
        const wishSnap = (await tx.get(wishRef)) as unknown as DocumentSnapshot;
        if (!giftSnap.exists) {
          throw new Error('gift_not_found');
        }
        const giftData = giftSnap.data() ?? {};
        if (giftData.tokenId !== payload.tokenId) {
          throw new Error('token_mismatch');
        }

        const supporterId =
          typeof giftData.supporterId === 'string' && giftData.supporterId
            ? giftData.supporterId
            : null;

        if (giftData.status === 'confirmed') {
          const total =
            typeof wishSnap.get('giftTotal') === 'number'
              ? (wishSnap.get('giftTotal') as number)
              : 0;
          return {
            status: 'already_confirmed' as const,
            supporterId,
            giftTotal: total,
          };
        }

        tx.update(giftRef, {
          status: 'confirmed',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const recipientId =
          typeof giftData.recipientId === 'string'
            ? (giftData.recipientId as string)
            : null;

        const sharedPayload = {
          amount: payload.amount,
          supporterId,
          recipientId,
          status: 'confirmed',
          variant: 'venmo',
          confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        tx.set(
          wishGiftRef,
          {
            ...sharedPayload,
            createdAt:
              giftData.createdAt instanceof admin.firestore.Timestamp
                ? giftData.createdAt
                : admin.firestore.FieldValue.serverTimestamp(),
            tokenId: payload.tokenId,
          },
          { merge: true },
        );

        tx.set(
          legacyRef,
          {
            ...sharedPayload,
            tokenId: payload.tokenId,
          },
          { merge: true },
        );

        const existingTotal =
          typeof wishSnap.get('giftTotal') === 'number'
            ? (wishSnap.get('giftTotal') as number)
            : 0;

        tx.set(
          wishRef,
          {
            giftTotal: admin.firestore.FieldValue.increment(payload.amount),
            fundingRaised: admin.firestore.FieldValue.increment(payload.amount),
            fundingSupporters: admin.firestore.FieldValue.increment(1),
          },
          { merge: true },
        );

        return {
          status: 'confirmed' as const,
          supporterId,
          giftTotal: existingTotal + payload.amount,
        };
      },
    );

    if (result.status === 'confirmed') {
      await incrementEngagement(result.supporterId ?? undefined, 'gifting');
    }

    res.json({
      status: result.status,
      wishId: payload.wishId,
      amount: payload.amount,
      giftTotal: result.giftTotal,
    });
  } catch (err) {
    logger.error('confirmGift failed', err, {
      giftId: payload.giftId,
    });
    if ((err as Error).message === 'gift_not_found') {
      res.status(404).json({ error: 'gift_not_found' });
    } else if ((err as Error).message === 'token_mismatch') {
      res.status(401).json({ error: 'invalid_token' });
    } else {
      res.status(500).json({ error: 'internal' });
    }
  }
}

async function upsertPinHandler(req: Request, res: Response) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const body = (req.body || {}) as {
    userId?: unknown;
    wishlistId?: unknown;
    title?: unknown;
    coverUri?: unknown;
  };
  const userId =
    typeof body.userId === 'string' && body.userId.trim().length
      ? body.userId.trim()
      : null;
  const wishlistId =
    typeof body.wishlistId === 'string' && body.wishlistId.trim().length
      ? body.wishlistId.trim()
      : null;
  if (!userId || !wishlistId) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  const payload: Record<string, unknown> = {
    wishlistId,
  };
  if (typeof body.title === 'string') {
    payload.title = body.title;
  }
  if (typeof body.coverUri === 'string') {
    payload.coverUri = body.coverUri;
  }
  try {
    const ref = db
      .collection('users')
      .doc(userId)
      .collection('pinnedWishlists')
      .doc(wishlistId);
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
      const snap = (await tx.get(ref)) as unknown as DocumentSnapshot;
      if (snap.exists) {
        tx.set(ref, payload, { merge: true });
      } else {
        tx.set(
          ref,
          {
            ...payload,
            pinnedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: false },
        );
      }
    });
    res.json({ pinned: true });
  } catch (err) {
    logger.error('Failed to upsert pinned wishlist', err, {
      userId,
      wishlistId,
    });
    res.status(500).json({ error: 'internal' });
  }
}

export const gifts = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    const path = (req.path || '').replace(/\/+$/, '');
    if (path === '' || path === '/') {
      res.status(200).json({ status: 'ok' });
      return;
    }
    if (path === '/start') {
      await giftStartHandler(req, res);
      return;
    }
    if (path === '/confirm') {
      await giftConfirmHandler(req, res);
      return;
    }
    res.status(404).json({ error: 'not_found' });
  });

export const pins = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    await upsertPinHandler(req, res);
  });

export const recentlists = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const token = extractBearerToken(req.get('Authorization'));
    if (!token) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }

    let decoded: DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (err) {
      logger.warn('Invalid token for recentlists request', err);
      res.status(401).json({ error: 'authentication_required' });
      return;
    }

    try {
      const snapshot = await db
        .collection('users')
        .doc(decoded.uid)
        .collection('recentWishlists')
        .orderBy('updatedAt', 'desc')
        .limit(10)
        .get();

      const items = snapshot.docs.map((docSnap: QueryDocumentSnapshot) => {
        const data = docSnap.data() ?? {};
        let updatedAt = Date.now();
        try {
          if (data.updatedAt instanceof admin.firestore.Timestamp) {
            updatedAt = data.updatedAt.toMillis();
          } else if (typeof data.updatedAt === 'number') {
            updatedAt = data.updatedAt;
          }
        } catch {
          updatedAt = Date.now();
        }
        const title =
          typeof data.title === 'string' && data.title.trim().length
            ? data.title.trim()
            : null;
        const coverUri =
          typeof data.coverUri === 'string' && data.coverUri.trim().length
            ? data.coverUri.trim()
            : null;
        return {
          id: docSnap.id,
          title,
          coverUri,
          updatedAt,
        };
      });

      res.status(200).json({ items });
    } catch (err) {
      logger.error('Failed to load recent wishlists (HTTP)', err, {
        severity: 'medium',
        userId: decoded.uid,
      });
      res.status(500).json({ error: 'internal' });
    }
  });

export const startGift = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    await giftStartHandler(req, res);
  });

export const confirmGift = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    await giftConfirmHandler(req, res);
  });

export const __test = { sendPush };

export const notifyWishLike = firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change: any, context: any) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.likes > before.likes && after.userId && !after.isAnonymous) {
      await sendPush(
        after.userId,
        'Someone liked your post! \u2764\ufe0f',
        'Your story is spreading good vibes.',
        'generic',
        `/wish/${context.params.wishId}`,
      );
    }
    return null;
  });

export const notifyWishComment = firestore
  .document('wishes/{wishId}/comments/{commentId}')
  .onCreate(async (snap: any, context: any) => {
    const wishId = context.params.wishId;
    const comment = snap.data();
    const wishSnap = await db.collection('wishes').doc(wishId).get();
    const wish = wishSnap.data();

    if (comment.parentId) {
      const parentSnap = await db
        .collection('wishes')
        .doc(wishId)
        .collection('comments')
        .doc(comment.parentId)
        .get();
      const parent = parentSnap.data();
      if (parent && parent.userId && !parent.isAnonymous) {
        await sendPush(
          parent.userId,
          'New reply to your comment \ud83d\udcac',
          'Someone replied to your comment.',
          'new_comment',
          `/wish/${wishId}`,
        );
      }
    } else if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(
        wish.userId,
        'New comment on your wish \ud83d\udcac',
        'Someone left a comment on your wish.',
        'new_comment',
        `/wish/${wishId}`,
      );
    }
    return null;
  });

export const notifyWishBoost = firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change: any, context: any) => {
    const before = change.before.data();
    const after = change.after.data();
    if (
      after.boostedUntil &&
      (!before.boostedUntil ||
        after.boostedUntil.seconds !== before.boostedUntil.seconds) &&
      after.userId &&
      !after.isAnonymous
    ) {
      await sendPush(
        after.userId,
        'Your wish was boosted! \ud83d\ude80',
        'Someone boosted your wish.',
        'wish_boosted',
        `/wish/${context.params.wishId}`,
      );
    }
    return null;
  });

export const notifyGiftReceived = firestore
  .document('wishes/{wishId}/gifts/{giftId}')
  .onCreate(async (snap: any, context: any) => {
    const wishId = context.params.wishId;
    const wishSnap = await db.collection('wishes').doc(wishId).get();
    const wish = wishSnap.data();
    if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(
        wish.userId,
        'You received a gift \ud83c\udf81',
        'Someone supported your wish.',
        'gift_received',
        `/wish/${wishId}`,
      );
    }
    return null;
  });

export const notifyBoostEnd = pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(
      Date.now() - 60 * 60 * 1000,
    );
    const snap = await db
      .collection('wishes')
      .where('boostedUntil', '>=', oneHourAgo)
      .where('boostedUntil', '<=', now)
      .get();
    await Promise.all(
      snap.docs.map((d: any) => {
        const data = d.data();
        if (data.userId && !data.isAnonymous) {
          return sendPush(
            data.userId,
            'Boost ended',
            'Boost again to keep visibility.',
          );
        }
        return null;
      }),
    );
    return null;
  });

export const notifyDMMessage = firestore
  .document('dmThreads/{threadId}/messages/{messageId}')
  .onCreate(async (snap: any, context: any) => {
    try {
      const data = snap.data();
      const threadId = context.params.threadId;
      const threadSnap = await db.collection('dmThreads').doc(threadId).get();
      const participants: string[] = threadSnap.get('participants') || [];
      const others = participants.filter((p) => p && p !== data.senderId);
      await Promise.all(
        others.map((uid) =>
          sendPush(
            uid,
            'New message',
            data.text || 'You have a new message',
            'generic',
            `/messages/${threadId}`,
          ),
        ),
      );
    } catch (err) {
      logger.error('Error notifying DM message', err);
    }
    return null;
  });

const runtimeConfig = readRuntimeConfig();

export const backfillPostTypesTask = runWith({
  timeoutSeconds: 540,
  memory: '1GB',
})
  .https.onRequest(async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const configToken = runtimeConfig?.maintenance?.token;
    const headerToken = req.headers['x-maintenance-token'];
    const providedHeader = Array.isArray(headerToken)
      ? headerToken[0]
      : headerToken;
    const queryTokenRaw = req.query.token;
    const providedQuery = Array.isArray(queryTokenRaw)
      ? queryTokenRaw[0]
      : queryTokenRaw;
    const providedToken = providedHeader || providedQuery;

    if (configToken) {
      if (!providedToken || providedToken !== configToken) {
        res.status(403).json({ error: 'unauthorized' });
        return;
      }
    }

    const rawDryRun = Array.isArray(req.query.dryRun)
      ? req.query.dryRun[0]
      : (req.query.dryRun as string | undefined);
    const dryRun =
      rawDryRun === undefined
        ? true
        : !(rawDryRun === 'false' || rawDryRun === '0');

    try {
      const result = await backfillPostTypes(db, {
        dryRun,
        log: (message, data) => logger.info(message, data),
      });
      res.json({ dryRun, ...result });
    } catch (err) {
      logger.error('Post type backfill failed', err);
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : 'unknown_error' });
    }
  });

export { createCheckoutSession } from './createCheckoutSession';
export { createGiftCheckoutSession } from './createGiftCheckoutSession';
export { createStripeAccountLink } from './createStripeAccountLink';
export { stripeWebhook } from './stripeWebhook';
export { rephraseWish } from './rephraseWish';
export { createSubscriptionCheckoutSession } from './createSubscriptionCheckoutSession';
export { createBillingPortalSession } from './createBillingPortalSession';
export { revenueCatWebhook } from './revenueCatWebhook';
export { logTelemetry } from './logTelemetry';
export { getCommunityPulse, getCommunityPulseHttp } from './communityPulse';
export { getDeveloperMetrics } from './developerMetrics';
export { createPledge } from './splitpay/createPledge';
export { settleWish, settleSplitPayWishes } from './splitpay/settleWish';
export { favoritesOnWrite, rateLimiter } from './anonFavorites';
export { generateWishMatches } from './wishMatcher';
export { expressCheckout } from './expressCheckout';
export { createGiftTogetherInvite } from './splitpay/createInvite';
export { api } from './httpApi';
