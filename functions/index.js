const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

async function sendPush(userId, title, body) {
  if (!userId) return null;
  const snap = await db.collection('users').doc(userId).get();
  const expoToken = snap.get('pushToken');
  const fcmToken = snap.get('fcmToken');
  if (expoToken && Expo.isExpoPushToken(expoToken)) {
    const messages = [{ to: expoToken, sound: 'default', title, body }];
    try {
      await expo.sendPushNotificationsAsync(messages);
    } catch (err) {
      console.error('Error sending Expo push notification', err);
    }
  } else if (fcmToken) {
    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
      });
    } catch (err) {
      console.error('Error sending FCM notification', err);
    }
  }
  return null;
}

exports.notifyWishLike = functions.firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.likes > before.likes && after.userId && !after.isAnonymous) {
      await sendPush(
        after.userId,
        'Someone liked your wish! \u2764\ufe0f',
        'Your dream is spreading good vibes.'
      );
    }
    return null;
  });

exports.notifyWishComment = functions.firestore
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
          'Someone replied to your comment.'
        );
      }
    } else if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(
        wish.userId,
        'New comment on your wish \ud83d\udcac',
        'Someone left a comment on your wish.'
      );
    }
    return null;
  });

exports.notifyWishBoost = functions.firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();
    if (
      after.boostedUntil &&
      (!before.boostedUntil || after.boostedUntil.seconds !== before.boostedUntil.seconds) &&
      after.userId &&
      !after.isAnonymous
    ) {
      await sendPush(after.userId, 'Your wish was boosted! 🚀', 'Someone boosted your wish.');
    }
    return null;
  });

exports.notifyGiftReceived = functions.firestore
  .document('wishes/{wishId}/gifts/{giftId}')
  .onCreate(async (snap, context) => {
    const wishId = context.params.wishId;
    const wishSnap = await db.collection('wishes').doc(wishId).get();
    const wish = wishSnap.data();
    if (wish && wish.userId && !wish.isAnonymous) {
      await sendPush(wish.userId, 'You received a gift \ud83c\udf81', 'Someone supported your wish.');
    }
    return null;
  });

exports.notifyBoostEnd = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    const snap = await db
      .collection('wishes')
      .where('boostedUntil', '>=', oneHourAgo)
      .where('boostedUntil', '<=', now)
      .get();
    await Promise.all(
      snap.docs.map((d) => {
        const data = d.data();
        if (data.userId && !data.isAnonymous) {
          return sendPush(data.userId, 'Boost ended', 'Boost again to keep visibility.');
        }
        return null;
      })
    );
    return null;
  });

exports.cleanupExpiredWishesJob = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();
    const snap = await db.collection('wishes').where('expiresAt', '<=', now).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return null;
  });
exports.createCheckoutSession = require('./createCheckoutSession').createCheckoutSession;
exports.createGiftCheckoutSession = require('./createGiftCheckoutSession').createGiftCheckoutSession;
exports.createStripeAccountLink = require('./createStripeAccountLink').createStripeAccountLink;
exports.stripeWebhook = require('./stripeWebhook').stripeWebhook;
