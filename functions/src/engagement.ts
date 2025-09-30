import * as admin from 'firebase-admin';

export type EngagementKind = 'posting' | 'gifting' | 'fulfillment';

const STREAK_MILESTONES: Record<EngagementKind, number[]> = {
  posting: [1, 3, 7, 14, 30],
  gifting: [1, 5, 15],
  fulfillment: [1, 3, 10],
};

const db = admin.firestore();

type StreakEntry = {
  current: number;
  longest: number;
  lastDate: string | null;
  milestones: Record<string, string>;
};

function getDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseEntry(raw: any): StreakEntry {
  const entry = typeof raw === 'object' && raw ? raw : {};
  const milestones = typeof entry.milestones === 'object' && entry.milestones
    ? Object.keys(entry.milestones).reduce<Record<string, string>>((acc, key) => {
        const value = entry.milestones[key];
        if (typeof value === 'string') {
          acc[key] = value;
        }
        return acc;
      }, {})
    : {};
  return {
    current: typeof entry.current === 'number' && entry.current >= 0 ? entry.current : 0,
    longest: typeof entry.longest === 'number' && entry.longest >= 0 ? entry.longest : 0,
    lastDate: typeof entry.lastDate === 'string' ? entry.lastDate : null,
    milestones,
  };
}

function diffDays(prevKey: string | null, currentKey: string): number | null {
  if (!prevKey) return null;
  const prev = Date.parse(`${prevKey}T00:00:00Z`);
  const current = Date.parse(`${currentKey}T00:00:00Z`);
  if (Number.isNaN(prev) || Number.isNaN(current)) {
    return null;
  }
  return Math.round((current - prev) / (24 * 60 * 60 * 1000));
}

export async function incrementEngagement(
  userId: string | undefined,
  kind: EngagementKind,
): Promise<string[]> {
  if (!userId) return [];
  const ref = db.collection('users').doc(userId).collection('progress').doc('engagement');
  const today = getDateKey();
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : undefined;
    const rawEntry = data && typeof data === 'object' ? (data as Record<string, unknown>)[kind] : undefined;
    const entry = parseEntry(rawEntry);
    if (entry.lastDate === today) {
      return [];
    }
    const gap = diffDays(entry.lastDate, today);
    const current = gap === 1 ? entry.current + 1 : 1;
    const longest = current > entry.longest ? current : entry.longest;
    const milestones = { ...entry.milestones };
    const unlocked: string[] = [];
    STREAK_MILESTONES[kind].forEach((threshold) => {
      const id = `${kind}_${threshold}`;
      if (current >= threshold && !milestones[id]) {
        milestones[id] = today;
        unlocked.push(id);
      }
    });

    tx.set(
      ref,
      {
        [kind]: {
          current,
          longest,
          lastDate: today,
          milestones,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return unlocked;
  });
}
