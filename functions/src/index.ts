import * as functions from 'firebase-functions';
import type { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { Expo } from 'expo-server-sdk';
import { backfillPostTypes } from './backfillPostTypes';
// Use Cloud Functions logger for server-side logs

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

type PushType =
  | 'wish_boosted'
  | 'new_comment'
  | 'referral_bonus'
  | 'gift_received'
  | 'generic';

async function sendPush(
  userId: string | undefined,
  title: string,
  body: string,
  type: PushType = 'generic',
  path?: string,
) {
  if (!userId) return null;
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  try {
    const prefs = snap.get('notificationPrefs');
    if (prefs && type !== 'generic' && prefs[type] === false) {
      return null;
    }
  } catch {}
  const expoToken = snap.get('pushToken');
  const fcmToken = snap.get('fcmToken');
  const metaRef = userRef.collection('meta').doc('push');
  const metaSnap = await metaRef.get();
  const last = metaSnap.exists ? metaSnap.get('lastSent') : null;
  const throttled = !!(last && Date.now() - last.toMillis() < 60000);

  // Always write to in-app inbox when allowed by prefs
  try {
    await userRef.collection('notifications').doc().set({
      type,
      title,
      message: body || title,
      path: path || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
    });
  } catch (err) {
    functions.logger.error('Error writing in-app notification', err);
  }

  if (throttled) return null;
  if (expoToken && Expo.isExpoPushToken(expoToken)) {
    const messages = [{ to: expoToken, sound: 'default', title, body }];
    try {
      await expo.sendPushNotificationsAsync(messages);
      await metaRef.set({
        lastSent: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      functions.logger.error('Error sending Expo push notification', err);
      if (fcmToken) {
        try {
          await admin
            .messaging()
            .send({ token: fcmToken, notification: { title, body } });
          await metaRef.set({
            lastSent: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (err2) {
          functions.logger.error('Error sending fallback FCM notification', err2);
        }
      }
    }
  } else if (fcmToken) {
    try {
      await admin
        .messaging()
        .send({ token: fcmToken, notification: { title, body } });
      await metaRef.set({
        lastSent: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      functions.logger.error('Error sending FCM notification', err);
    }
  }
  return null;
}

export const __test = { sendPush };

export const notifyWishLike = functions.firestore
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

export const notifyWishComment = functions.firestore
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

export const notifyWishBoost = functions.firestore
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

export const notifyGiftReceived = functions.firestore
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

export const notifyBoostEnd = functions.pubsub
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

export const notifyDMMessage = functions.firestore
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
      functions.logger.error('Error notifying DM message', err);
    }
    return null;
  });

const runtimeConfig = (functions as unknown as { config?: () => any }).config?.() ?? {};

export const backfillPostTypesTask = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onRequest(async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const configToken = runtimeConfig?.maintenance?.token;
    const headerToken = req.headers['x-maintenance-token'];
    const providedHeader = Array.isArray(headerToken) ? headerToken[0] : headerToken;
    const queryTokenRaw = req.query.token;
    const providedQuery = Array.isArray(queryTokenRaw) ? queryTokenRaw[0] : queryTokenRaw;
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
    const dryRun = rawDryRun === undefined ? true : !(rawDryRun === 'false' || rawDryRun === '0');

    try {
      const result = await backfillPostTypes(db, {
        dryRun,
        log: (message, data) => functions.logger.info(message, data),
      });
      res.json({ dryRun, ...result });
    } catch (err) {
      functions.logger.error('Post type backfill failed', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'unknown_error' });
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
