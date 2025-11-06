import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import { Expo } from 'expo-server-sdk';

const db = admin.firestore();
const expo = new Expo();

export type PushType =
  | 'wish_boosted'
  | 'new_comment'
  | 'referral_bonus'
  | 'gift_received'
  | 'splitpay_pledge'
  | 'splitpay_funded'
  | 'splitpay_capture'
  | 'splitpay_expired'
  | 'splitpay_invite'
  | 'generic';

type SendPushOptions = {
  path?: string | null;
};

export async function sendPush(
  userId: string | undefined,
  title: string,
  body: string,
  type: PushType = 'generic',
  path?: string,
  options: SendPushOptions = {},
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

  try {
    await userRef
      .collection('notifications')
      .doc()
      .set({
        type,
        title,
        message: body || title,
        path: path ?? options.path ?? null,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
  } catch (err) {
    functions.logger.error('Error writing in-app notification', err);
  }

  if (throttled) return null;
  const pushPath = path ?? options.path ?? undefined;

  if (expoToken && Expo.isExpoPushToken(expoToken)) {
    const messages = [
      {
        to: expoToken,
        sound: 'default',
        title,
        body,
        data: pushPath ? { path: pushPath } : undefined,
      },
    ];
    try {
      await expo.sendPushNotificationsAsync(messages);
      await metaRef.set({
        lastSent: admin.firestore.FieldValue.serverTimestamp(),
      });
      return null;
    } catch (err) {
      functions.logger.error('Error sending Expo push notification', err);
      if (!fcmToken) return null;
      try {
        await admin
          .messaging()
          .send({
            token: fcmToken,
            notification: { title, body },
            data: pushPath ? { path: pushPath } : undefined,
          });
        await metaRef.set({
          lastSent: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (err2) {
        functions.logger.error('Error sending fallback FCM notification', err2);
      }
      return null;
    }
  }
  if (fcmToken) {
    try {
      await admin
        .messaging()
        .send({
          token: fcmToken,
          notification: { title, body },
          data: pushPath ? { path: pushPath } : undefined,
        });
      await metaRef.set({
        lastSent: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      functions.logger.error('Error sending FCM notification', err);
    }
  }
  return null;
}
