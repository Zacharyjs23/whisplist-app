import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Expo } from 'expo-server-sdk';
import * as logger from '../../shared/logger.ts';

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

async function sendPush(
  userId: string | undefined,
  title: string,
  body: string,
) {
  if (!userId) return null;
  const userRef = db.collection('users').doc(userId);
  const snap = await userRef.get();
  const expoToken = snap.get('pushToken');
  const fcmToken = snap.get('fcmToken');
  const metaRef = userRef.collection('meta').doc('push');
  const metaSnap = await metaRef.get();
  const last = metaSnap.exists ? metaSnap.get('lastSent') : null;
  if (last && Date.now() - last.toMillis() < 60000) {
    return null;
  }
  if (expoToken && Expo.isExpoPushToken(expoToken)) {
    const messages = [{ to: expoToken, sound: 'default', title, body }];
    try {
      await expo.sendPushNotificationsAsync(messages);
      await metaRef.set({
        lastSent: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.error('Error sending Expo push notification', err);
      if (fcmToken) {
        try {
          await admin
            .messaging()
            .send({ token: fcmToken, notification: { title, body } });
          await metaRef.set({
            lastSent: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (err2) {
          logger.error('Error sending fallback FCM notification', err2);
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
      logger.error('Error sending FCM notification', err);
    }
  }
  return null;
}

export const __test = { sendPush };

export const notifyWishLike = functions.firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.likes > before.likes && after.userId && !after.isAnonymous) {
      await sendPush(
        after.userId,
        'Someone liked your wish! \u2764\ufe0f',
        'Your dream is spreading good vibes.',
      );
    }
    return null;
  });

export const notifyWishComment = functions.firestore
  .document('wishes/{wishId}/comments/{commentId}')
  .onCreate(async (snap, context) => {
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
        );
      }
    } else if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(
        wish.userId,
        'New comment on your wish \ud83d\udcac',
        'Someone left a comment on your wish.',
      );
    }
    return null;
  });

export const notifyWishBoost = functions.firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change) => {
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
      );
    }
    return null;
  });

export const notifyGiftReceived = functions.firestore
  .document('wishes/{wishId}/gifts/{giftId}')
  .onCreate(async (snap, context) => {
    const wishId = context.params.wishId;
    const wishSnap = await db.collection('wishes').doc(wishId).get();
    const wish = wishSnap.data();
    if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(
        wish.userId,
        'You received a gift \ud83c\udf81',
        'Someone supported your wish.',
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
      snap.docs.map((d) => {
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

export { createCheckoutSession } from './createCheckoutSession';
export { createGiftCheckoutSession } from './createGiftCheckoutSession';
export { createStripeAccountLink } from './createStripeAccountLink';
export { stripeWebhook } from './stripeWebhook';
export { rephraseWish } from './rephraseWish';
