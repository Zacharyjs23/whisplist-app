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
import type { DecodedIdToken } from 'firebase-admin/auth';
import type {
  DocumentSnapshot,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { backfillPostTypes } from './backfillPostTypes';
import { createGiftHttpHandlers } from './gifts/http';
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

const { giftStartHandler: handleGiftStart, giftConfirmHandler: handleGiftConfirm } =
  createGiftHttpHandlers({
    db,
    readRuntimeConfig,
  });

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
      await handleGiftStart(req, res);
      return;
    }
    if (path === '/confirm') {
      await handleGiftConfirm(req, res);
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
    await handleGiftStart(req, res);
  });

export const confirmGift = region('us-central1')
  .https.onRequest(async (req: Request, res: Response) => {
    await handleGiftConfirm(req, res);
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
