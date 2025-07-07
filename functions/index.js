const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

admin.initializeApp();
const db = admin.firestore();
const expo = new Expo();

async function sendPush(userId, title, body) {
  if (!userId) return null;
  const snap = await db.collection('users').doc(userId).get();
  const token = snap.get('pushToken');
  if (!token || !Expo.isExpoPushToken(token)) return null;
  const messages = [{ to: token, sound: 'default', title, body }];
  try {
    await expo.sendPushNotificationsAsync(messages);
  } catch (err) {
    console.error('Error sending push notification', err);
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
