import { https, logger, runWith } from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import type {
  CollectionReference,
  DocumentReference,
  Query,
} from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const { HttpsError } = https;
const PAGE_SIZE = 100;

async function deleteQueryDocs(query: Query, pageSize = PAGE_SIZE) {
  let deleted = 0;
  while (true) {
    const snap = await query.limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
      deleted += 1;
    });
    await batch.commit();
  }
  return deleted;
}

async function deleteDocumentTree(docRef: DocumentReference): Promise<number> {
  let deleted = 0;
  const subcollections = await docRef.listCollections();
  for (const subcollection of subcollections) {
    deleted += await deleteCollectionTree(subcollection);
  }
  await docRef.delete();
  return deleted + 1;
}

async function deleteCollectionTree(
  collectionRef: CollectionReference,
  pageSize = PAGE_SIZE,
): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await collectionRef.limit(pageSize).get();
    if (snap.empty) break;
    for (const docSnap of snap.docs) {
      deleted += await deleteDocumentTree(docSnap.ref);
    }
  }
  return deleted;
}

async function cleanupFollowEdges(uid: string): Promise<number> {
  let deleted = 0;
  const userRef = db.collection('users').doc(uid);

  while (true) {
    const followingSnap = await userRef.collection('following').limit(PAGE_SIZE).get();
    if (followingSnap.empty) break;
    const batch = db.batch();
    for (const followingDoc of followingSnap.docs) {
      batch.delete(
        db
          .collection('users')
          .doc(followingDoc.id)
          .collection('followers')
          .doc(uid),
      );
      batch.delete(followingDoc.ref);
      deleted += 2;
    }
    await batch.commit();
  }

  while (true) {
    const followersSnap = await userRef.collection('followers').limit(PAGE_SIZE).get();
    if (followersSnap.empty) break;
    const batch = db.batch();
    for (const followerDoc of followersSnap.docs) {
      batch.delete(
        db
          .collection('users')
          .doc(followerDoc.id)
          .collection('following')
          .doc(uid),
      );
      batch.delete(followerDoc.ref);
      deleted += 2;
    }
    await batch.commit();
  }

  return deleted;
}

async function deleteOwnedWishes(uid: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection('wishes')
      .where('userId', '==', uid)
      .limit(25)
      .get();
    if (snap.empty) break;
    for (const wishDoc of snap.docs) {
      deleted += await deleteDocumentTree(wishDoc.ref);
    }
  }
  return deleted;
}

async function deleteUserThreads(uid: string): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db
      .collection('dmThreads')
      .where('participants', 'array-contains', uid)
      .limit(25)
      .get();
    if (snap.empty) break;
    for (const threadDoc of snap.docs) {
      deleted += await deleteDocumentTree(threadDoc.ref);
    }
  }
  return deleted;
}

export const deleteMyAccount = runWith({
    timeoutSeconds: 540,
    memory: '1GB',
  })
  .region('us-central1')
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info('deleteMyAccount started', { uid });

    let deletedDocs = 0;
    try {
      deletedDocs += await cleanupFollowEdges(uid);
      deletedDocs += await deleteOwnedWishes(uid);
      deletedDocs += await deleteUserThreads(uid);
      deletedDocs += await deleteQueryDocs(
        db.collectionGroup('comments').where('userId', '==', uid),
      );
      deletedDocs += await deleteQueryDocs(
        db.collection('wishes').where('userId', '==', uid),
      );

      const userRef = db.collection('users').doc(uid);
      const userSnap = await userRef.get();
      const stripeCustomerId = userSnap.exists
        ? userSnap.get('stripeCustomerId')
        : null;

      if (userSnap.exists) {
        deletedDocs += await deleteDocumentTree(userRef);
      }

      if (typeof stripeCustomerId === 'string' && stripeCustomerId.length > 0) {
        await db.collection('stripeCustomers').doc(stripeCustomerId).delete();
      }

      await admin.auth().deleteUser(uid);

      logger.info('deleteMyAccount completed', { uid, deletedDocs });
      return { ok: true, deletedDocs };
    } catch (error) {
      logger.error('deleteMyAccount failed', { uid, error });
      throw new HttpsError('internal', 'Unable to delete account right now');
    }
  });
