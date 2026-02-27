import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import type {
  DocumentData,
  DocumentReference,
  Transaction,
} from 'firebase-admin/firestore';

const getDb = () => admin.firestore();

const MAX_SAMPLE_NOTES = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const NOTE_BLOCKLIST = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'slut',
  'cunt',
  'dick',
  'pussy',
  'nigger',
  'faggot',
];

type FavoriteEntry = {
  note?: unknown;
};

type StatsDoc = {
  favorites?: number;
  sampleNotes?: unknown;
};

const sanitizeNote = (input: unknown): string | null => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.slice(0, 90);
  const lower = normalized.toLowerCase();
  if (NOTE_BLOCKLIST.some((blocked) => lower.includes(blocked))) {
    return null;
  }
  return normalized;
};

export const favoritesOnWrite = functions.firestore
  .document('wishFavorites/{wishId}/entries/{entryId}')
  .onWrite(async (change, context) => {
    const wishId = context.params.wishId as string;
    if (!wishId) {
      functions.logger.warn('favoritesOnWrite missing wishId');
      return;
    }

    const db = getDb();
    const beforeData = change.before.exists
      ? (change.before.data() as FavoriteEntry)
      : null;
    const afterData = change.after.exists
      ? (change.after.data() as FavoriteEntry)
      : null;

    const beforeNote = sanitizeNote(beforeData?.note);
    const afterNote = sanitizeNote(afterData?.note);

    // Cleanse stored note if profanity detected or trimmed value differs.
    if (change.after.exists) {
      const storedNote =
        typeof afterData?.note === 'string' ? afterData.note : undefined;
      const shouldRemove = afterNote === null && storedNote;
      const shouldUpdate = afterNote && storedNote !== afterNote;
      if (shouldRemove) {
        await change.after.ref.update({ note: null });
      } else if (shouldUpdate) {
        await change.after.ref.update({ note: afterNote });
      }
    }

    const statsRef = db
      .collection('wishStats')
      .doc(wishId) as DocumentReference<DocumentData>;
    await db.runTransaction(async (tx: Transaction) => {
      const statsSnap = await tx.get(statsRef);
      const stats = (statsSnap.exists ? statsSnap.data() : {}) as StatsDoc;
      const currentCount =
        typeof stats.favorites === 'number' ? stats.favorites : 0;
      let notes = Array.isArray(stats.sampleNotes)
        ? (stats.sampleNotes.filter((n) => typeof n === 'string') as string[])
        : [];

      if (change.before.exists && !change.after.exists) {
        // Delete
        const nextCount = Math.max(0, currentCount - 1);
        tx.set(
          statsRef,
          {
            favorites: nextCount,
            sampleNotes: notes.filter((note) => note !== beforeNote),
          },
          { merge: true },
        );
        return;
      }

      if (!change.before.exists && change.after.exists) {
        // Create
        const nextCount = currentCount + 1;
        if (afterNote) {
          notes = [...notes, afterNote];
        }
        if (notes.length > MAX_SAMPLE_NOTES) {
          notes = notes.slice(notes.length - MAX_SAMPLE_NOTES);
        }
        tx.set(
          statsRef,
          { favorites: nextCount, sampleNotes: notes },
          { merge: true },
        );
        return;
      }

      if (
        change.before.exists &&
        change.after.exists &&
        beforeNote !== afterNote
      ) {
        if (beforeNote) {
          const idx = notes.indexOf(beforeNote);
          if (idx !== -1) {
            notes.splice(idx, 1);
          }
        }
        if (afterNote) {
          notes.push(afterNote);
        }
        if (notes.length > MAX_SAMPLE_NOTES) {
          notes = notes.slice(notes.length - MAX_SAMPLE_NOTES);
        }
        tx.set(statsRef, { sampleNotes: notes }, { merge: true });
      }
    });
  });

export const rateLimiter = functions.https.onCall(async (data) => {
  const wishId = typeof data?.wishId === 'string' ? data.wishId.trim() : null;
  const anonHash =
    typeof data?.anonHash === 'string' ? data.anonHash.trim() : null;
  if (!wishId || !anonHash) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'wishId and anonHash are required.',
    );
  }

  const db = getDb();
  const tokenRef = db
    .collection('wishFavoriteTokens')
    .doc(`${wishId}:${anonHash}`) as DocumentReference<DocumentData>;
  const now = Date.now();
  const cooldownUntil = new Date(now + RATE_LIMIT_WINDOW_MS);
  const permitExpiresAt = new Date(now + 60_000);

  const toMillis = (value: unknown): number | null => {
    if (!value) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof (value as any)?.toDate === 'function') {
      return (value as any).toDate().getTime();
    }
    return null;
  };

  const allowed = await db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(tokenRef);
    if (snap.exists) {
      const cooldownMs = toMillis(snap.get('cooldownUntil'));
      if (cooldownMs && cooldownMs > now) {
        return false;
      }
    }
    tx.set(tokenRef, {
      wishId,
      anonHash,
      createdAt: new Date(now),
      cooldownUntil,
      permitExpiresAt,
    });
    return true;
  });

  return { allowed, permitExpiresAt: permitExpiresAt.getTime() };
});
