import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const { https } = functions;
const { HttpsError } = https;

const DAYS_7_MS = 7 * 24 * 60 * 60 * 1000;

export const getDeveloperMetrics = https.onCall(async (_data: unknown, context: any) => {
  if (!context.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  try {
    const userSnap = await db.collection('users').doc(context.auth.uid).get();
    const isDeveloper = userSnap.exists && userSnap.get('developerMode') === true;
    if (!isDeveloper) {
      throw new HttpsError('permission-denied', 'Developer mode required');
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() - DAYS_7_MS);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

    const [wishCountSnap, boostCountSnap, giftCountSnap, recentUsersSnap] = await Promise.all([
      db.collection('wishes').count().get(),
      db.collection('wishes').where('boostedUntil', '>', now).count().get(),
      db.collectionGroup('gifts').count().get(),
      db.collection('users').where('createdAt', '>=', cutoffTs).count().get(),
    ]);

    return {
      wishCount: wishCountSnap.data().count ?? 0,
      activeBoostCount: boostCountSnap.data().count ?? 0,
      giftCount: giftCountSnap.data().count ?? 0,
      recentUserCount: recentUsersSnap.data().count ?? 0,
      generatedAt: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    functions.logger.error('Failed to load developer metrics', error);
    throw new HttpsError('internal', 'Failed to load developer metrics');
  }
});
