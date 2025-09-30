import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { addWish } from '@/helpers/wishes';
import { trackEvent } from '@/helpers/analytics';
import { recordEngagementEvent } from '@/helpers/engagement';
import { normalizePostType } from '@/types/post';
import { recordPostTypeUsage } from '@/helpers/postPreferences';

type PendingWish = any & {
  enqueuedAt?: number;
  attempts?: number;
  nextAttemptAt?: number | null;
};

const KEY = 'pendingWishQueue.v1';
const MAX_QUEUE_LENGTH = 20;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 15 * 60 * 1000;

function trimQueue(list: PendingWish[]) {
  if (list.length <= MAX_QUEUE_LENGTH) return null;
  let oldestIndex = 0;
  let oldestValue = typeof list[0]?.enqueuedAt === 'number' ? (list[0].enqueuedAt as number) : Number.POSITIVE_INFINITY;
  for (let i = 1; i < list.length; i += 1) {
    const candidate = typeof list[i]?.enqueuedAt === 'number' ? (list[i].enqueuedAt as number) : Number.POSITIVE_INFINITY;
    if (candidate < oldestValue) {
      oldestValue = candidate;
      oldestIndex = i;
    }
  }
  const [dropped] = list.splice(oldestIndex, 1);
  return dropped ?? null;
}

async function checkOnline(): Promise<boolean> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 2500);

  try {
    const requestInit: RequestInit = {
      method: Platform.OS === 'web' ? 'GET' : 'HEAD',
      signal: controller.signal,
    };

    if (Platform.OS === 'web') {
      requestInit.mode = 'no-cors';
    }

    const resp = await fetch('https://clients3.google.com/generate_204', requestInit);

    if (Platform.OS === 'web') {
      return true;
    }

    return !!resp?.ok;
  } catch {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
        return navigator.onLine;
      }
    }
    return false;
  } finally {
    clearTimeout(id);
  }
}

export async function enqueuePendingWish(payload: PendingWish) {
  const raw = await AsyncStorage.getItem(KEY);
  const list: PendingWish[] = raw ? (JSON.parse(raw) as PendingWish[]) : [];
  const entry: PendingWish = {
    ...payload,
    enqueuedAt: payload?.enqueuedAt ?? Date.now(),
    attempts: payload?.attempts ?? 0,
    nextAttemptAt: payload?.nextAttemptAt ?? null,
  };
  list.push(entry);
  const dropped = trimQueue(list);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
  const entryType = normalizePostType((entry as { type?: string })?.type);
  const droppedType = dropped ? normalizePostType((dropped as { type?: string })?.type) : null;
  try {
    trackEvent('offline_queue_enqueued', {
      size: list.length,
      dropped: dropped ? 1 : 0,
      post_type: entryType,
    });
    if (dropped) {
      trackEvent('offline_queue_drop', {
        reason: 'overflow',
        attempts: dropped.attempts ?? 0,
        age_ms: dropped.enqueuedAt ? Date.now() - dropped.enqueuedAt : null,
        post_type: droppedType,
      });
    }
  } catch {}
}

export async function getQueueStatus() {
  const raw = await AsyncStorage.getItem(KEY);
  const list: PendingWish[] = raw ? (JSON.parse(raw) as PendingWish[]) : [];
  const now = Date.now();
  const oldest = list.length ? Math.min(...list.map((i) => i.enqueuedAt || now)) : null;
  const nextRetry = list
    .map((i) => i.nextAttemptAt)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b)[0] ?? null;
  return {
    size: list.length,
    oldestMs: oldest ? now - oldest : null,
    nextRetryMs: nextRetry ? Math.max(0, nextRetry - now) : null,
  };
}

export async function clearQueue() {
  await AsyncStorage.setItem(KEY, JSON.stringify([]));
}

export async function flushPendingWishes() {
  const online = await checkOnline();
  if (!online) {
    const queuedRaw = await AsyncStorage.getItem(KEY);
    const queued: PendingWish[] = queuedRaw ? (JSON.parse(queuedRaw) as PendingWish[]) : [];
    const nextType = queued.length
      ? normalizePostType((queued[0] as { type?: string })?.type)
      : null;
    try {
      trackEvent('offline_queue_state', {
        online: false,
        queue_size: queued.length,
        next_type: nextType,
      });
    } catch {}
    const { size, oldestMs } = await getQueueStatus();
    return { posted: 0, remaining: size, oldestMs };
  }
  const raw = await AsyncStorage.getItem(KEY);
  let list: PendingWish[] = raw ? (JSON.parse(raw) as PendingWish[]) : [];
  if (!list.length) return { posted: 0, remaining: 0, oldestMs: null };
  const now = Date.now();
  const processable = list.filter((i) => !i.nextAttemptAt || i.nextAttemptAt <= now);
  const remaining: PendingWish[] = list.filter((i) => i.nextAttemptAt && i.nextAttemptAt > now);
  let posted = 0;
  for (const item of processable) {
    try {
      await addWish(item);
      try {
        await recordEngagementEvent(item?.userId, 'posting');
      } catch {}
      posted += 1;
      const normalizedType = normalizePostType((item as { type?: string })?.type);
      try {
        trackEvent('post_success', {
          offline: true,
          has_image: !!item.imageUrl,
          has_audio: !!item.audioUrl,
          text_length: (item.text || '').length,
          post_type: normalizedType,
        });
      } catch {}
      if (item?.userId) {
        try {
          await recordPostTypeUsage(item.userId, normalizedType);
        } catch {}
      }
    } catch {
      const attempts = (item.attempts || 0) + 1;
      const delay = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * Math.pow(2, attempts - 1),
      );
      remaining.push({
        ...item,
        attempts,
        nextAttemptAt: now + delay,
        enqueuedAt: item.enqueuedAt ?? now,
      });
    }
  }
  trimQueue(remaining);
  await AsyncStorage.setItem(KEY, JSON.stringify(remaining));
  const oldest = remaining.length ? Math.min(...remaining.map((r) => r.enqueuedAt || now)) : now;
  const nextType = remaining.length
    ? normalizePostType((remaining[0] as { type?: string })?.type)
    : null;
  try {
    trackEvent('offline_queue_state', {
      online: true,
      queue_size: remaining.length,
      oldest_ms: now - oldest,
      posted,
      attempted: processable.length,
      next_type: nextType,
    });
  } catch {}
  return { posted, remaining: remaining.length, oldestMs: now - oldest };
}
