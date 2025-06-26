const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

exports.notifyWishLike = functions.firestore
  .document('wishes/{wishId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.likes > before.likes && after.pushToken) {
      const token = after.pushToken;
      if (!Expo.isExpoPushToken(token)) return null;
      const messages = [
        {
          to: token,
          sound: 'default',
          title: 'Someone liked your wish! \u2764\ufe0f',
          body: 'Your dream is spreading good vibes.',
        },
      ];
      try {
        await expo.sendPushNotificationsAsync(messages);
      } catch (err) {
        console.error('Error sending like notification', err);
      }
    }
    return null;
  });

exports.notifyWishComment = functions.firestore
  .document('wishes/{wishId}/comments/{commentId}')
  .onCreate(async (snap, context) => {
    const wishId = context.params.wishId;
    const wishSnap = await db.collection('wishes').doc(wishId).get();
    const wish = wishSnap.data();
    if (!wish || !wish.pushToken) return null;
    const token = wish.pushToken;
    if (!Expo.isExpoPushToken(token)) return null;
    const messages = [
      {
        to: token,
        sound: 'default',
        title: 'New comment on your wish \ud83d\udcac',
        body: 'Someone left a comment on your wish.',
      },
    ];
    try {
      await expo.sendPushNotificationsAsync(messages);
    } catch (err) {
      console.error('Error sending comment notification', err);
    }
    return null;
  });
