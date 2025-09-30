import {
  doc,
  runTransaction,
  serverTimestamp,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '@/firebase';
import { getLocalDateKey } from '@/helpers/date';
import type {
  EngagementKind,
  EngagementStats,
  EngagementUpdateResult,
  MilestoneId,
  StreakEntry,
} from '@/types/Engagement';

const STREAK_MILESTONES: Record<EngagementKind, number[]> = {
  posting: [1, 3, 7, 14, 30],
  gifting: [1, 5, 15],
  fulfillment: [1, 3, 10],
};

const VALID_MILESTONE_IDS = new Set<MilestoneId>(
  (Object.keys(STREAK_MILESTONES) as EngagementKind[]).flatMap((kind) =>
    STREAK_MILESTONES[kind].map((value) => `${kind}_${value}` as MilestoneId),
  ),
);

const DEFAULT_ENTRY: StreakEntry = {
  current: 0,
  longest: 0,
  lastDate: null,
  milestones: {},
};

function parseDateKey(key: string | null | undefined): Date | null {
  if (!key || typeof key !== 'string') return null;
  const [y, m, d] = key.split('-').map((part) => Number(part));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(prevKey: string | null, nextKey: string): number | null {
  const prev = parseDateKey(prevKey);
  const next = parseDateKey(nextKey);
  if (!prev || !next) return null;
  const diffMs = next.getTime() - prev.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

function normalizeEntry(input: unknown): StreakEntry {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_ENTRY };
  }
  const candidate = input as Partial<StreakEntry>;
  const milestones: Partial<Record<MilestoneId, string | true>> = {};
  if (candidate.milestones && typeof candidate.milestones === 'object') {
    Object.keys(candidate.milestones).forEach((key) => {
      if (VALID_MILESTONE_IDS.has(key as MilestoneId) && candidate.milestones) {
        milestones[key as MilestoneId] = candidate.milestones[key as MilestoneId];
      }
    });
  }
  return {
    current: typeof candidate.current === 'number' && candidate.current >= 0 ? candidate.current : 0,
    longest: typeof candidate.longest === 'number' && candidate.longest >= 0 ? candidate.longest : 0,
    lastDate:
      typeof candidate.lastDate === 'string' && candidate.lastDate.length >= 8
        ? candidate.lastDate
        : null,
    milestones,
  };
}

function toStats(data?: Partial<EngagementStats> | null): EngagementStats {
  return {
    posting: normalizeEntry(data?.posting),
    gifting: normalizeEntry(data?.gifting),
    fulfillment: normalizeEntry(data?.fulfillment),
    updatedAt: data?.updatedAt,
  };
}

function getMilestoneId(kind: EngagementKind, value: number): MilestoneId {
  return `${kind}_${value}` as MilestoneId;
}

function applyEvent(
  kind: EngagementKind,
  entry: StreakEntry,
  todayKey: string,
): { entry: StreakEntry; unlocked: MilestoneId[] } {
  const gap = daysBetween(entry.lastDate, todayKey);
  let current = entry.current;
  if (entry.lastDate === todayKey) {
    // Already counted today, nothing to do
    return { entry, unlocked: [] };
  }
  if (gap === 1) {
    current = current + 1;
  } else {
    current = 1;
  }
  const longest = Math.max(entry.longest, current);
  const updated: StreakEntry = {
    current,
    longest,
    lastDate: todayKey,
    milestones: { ...entry.milestones },
  };

  const unlocked: MilestoneId[] = [];
  const milestones = STREAK_MILESTONES[kind];
  milestones.forEach((threshold) => {
    const id = getMilestoneId(kind, threshold);
    if (current >= threshold && !(id in updated.milestones)) {
      unlocked.push(id);
      updated.milestones[id] = todayKey;
    }
  });
  return { entry: updated, unlocked };
}

export async function recordEngagementEvent(
  userId: string | null | undefined,
  kind: EngagementKind,
): Promise<EngagementUpdateResult | null> {
  if (!userId || !db) return null;
  const todayKey = getLocalDateKey();
  const ref = doc(db, 'users', userId, 'progress', 'engagement');
  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const stats = toStats(snap.exists() ? (snap.data() as Partial<EngagementStats>) : null);
      const { entry, unlocked } = applyEvent(kind, stats[kind], todayKey);
      if (!unlocked.length && entry.lastDate === stats[kind].lastDate && entry.current === stats[kind].current) {
        return {
          kind,
          current: entry.current,
          longest: entry.longest,
          unlocked,
        } satisfies EngagementUpdateResult;
      }
      tx.set(
        ref,
        {
          [kind]: entry,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      return {
        kind,
        current: entry.current,
        longest: entry.longest,
        unlocked,
      } satisfies EngagementUpdateResult;
    });
    return result;
  } catch (err) {
    const error = err as FirestoreError;
    if (error?.code === 'permission-denied') {
      return null;
    }
    throw err;
  }
}

export function getMilestonesFor(kind: EngagementKind): number[] {
  return STREAK_MILESTONES[kind];
}

export function getDefaultStats(): EngagementStats {
  return {
    posting: { ...DEFAULT_ENTRY },
    gifting: { ...DEFAULT_ENTRY },
    fulfillment: { ...DEFAULT_ENTRY },
  };
}

export function fromSnapshotData(data?: Partial<EngagementStats> | null): EngagementStats {
  return toStats(data);
}

export function getNextMilestone(
  kind: EngagementKind,
  entry: StreakEntry,
): { id: MilestoneId; target: number } | null {
  const milestones = STREAK_MILESTONES[kind];
  for (let i = 0; i < milestones.length; i += 1) {
    const target = milestones[i];
    const id = getMilestoneId(kind, target);
    if (!(id in entry.milestones)) {
      return { id, target };
    }
  }
  return null;
}
