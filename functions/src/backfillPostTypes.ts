import * as admin from 'firebase-admin';

type PostType = 'celebration' | 'goal' | 'struggle' | 'advice';
type LegacyPostType = 'wish' | 'dream' | 'confession' | 'advice';

const LEGACY_TO_POST_TYPE: Record<LegacyPostType, PostType> = {
  wish: 'goal',
  dream: 'goal',
  confession: 'struggle',
  advice: 'advice',
};

const BATCH_SIZE = 500;

interface BackfillOptions {
  dryRun?: boolean;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

type FirestoreLike = FirebaseFirestore.Firestore;

type BackfillResults = {
  typeUpdates: Record<LegacyPostType, number>;
  categoryUpdates: Record<LegacyPostType, number>;
};

const defaultLog = (message: string, data?: Record<string, unknown>) => {
  if (data) {
    console.log(`[backfillPostTypes] ${message}`, data);
  } else {
    console.log(`[backfillPostTypes] ${message}`);
  }
};

async function backfillTypeField(
  db: FirestoreLike,
  field: 'type' | 'category',
  legacy: LegacyPostType,
  target: PostType,
  options: BackfillOptions,
): Promise<number> {
  let updated = 0;
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  const { dryRun = false, log = defaultLog } = options;
  const fieldPath = admin.firestore.FieldPath.documentId();

  // Loop until no more matching documents
  while (true) {
    let query = db
      .collection('wishes')
      .where(field, '==', legacy)
      .orderBy(fieldPath)
      .limit(BATCH_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (snap.empty) break;

    if (!dryRun) {
      const batch = db.batch();
      snap.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        const ref = doc.ref;
        if (field === 'type') {
          batch.update(ref, { type: target, category: target });
        } else {
          batch.update(ref, { category: target });
        }
      });
      await batch.commit();
    }

    updated += snap.size;
    lastDoc = snap.docs[snap.docs.length - 1];
    log('Processed batch', {
      field,
      legacy,
      target,
      batchSize: snap.size,
      totalUpdated: updated,
      dryRun,
    });

    if (snap.size < BATCH_SIZE) {
      break;
    }
  }

  return updated;
}

export async function backfillPostTypes(
  db: FirestoreLike = admin.firestore(),
  options: BackfillOptions = {},
): Promise<BackfillResults> {
  const { log = defaultLog } = options;
  const typeUpdates: Record<LegacyPostType, number> = {
    wish: 0,
    dream: 0,
    confession: 0,
    advice: 0,
  };
  const categoryUpdates: Record<LegacyPostType, number> = {
    wish: 0,
    dream: 0,
    confession: 0,
    advice: 0,
  };

  for (const [legacy, target] of Object.entries(LEGACY_TO_POST_TYPE) as [
    LegacyPostType,
    PostType
  ][]) {
    if (legacy !== target) {
      typeUpdates[legacy] = await backfillTypeField(
        db,
        'type',
        legacy,
        target,
        options,
      );
    }
    categoryUpdates[legacy] = await backfillTypeField(
      db,
      'category',
      legacy,
      target,
      options,
    );
    log('Completed backfill for legacy value', { legacy, target });
  }

  return { typeUpdates, categoryUpdates };
}

export const __test = { backfillTypeField, LEGACY_TO_POST_TYPE };
