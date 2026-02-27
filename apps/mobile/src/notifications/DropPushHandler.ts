import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import experimentsConfig from '@/infra/experiments/experimentsConfig.json';
import { stableHash } from '@/src/experiments/useExperiment';
import { trackEvent } from '@/helpers/analytics';

const EXPERIMENT_KEY = 'ephemeral_drop_push';
const DAILY_CAP = 2;
const STORAGE_PREFIX = 'dropPushDailyCount.v1';

type SendPushFn = (payload: {
  variant: string;
  experiment: string;
}) => Promise<void> | void;

type MaybeSendOptions = {
  userId: string;
  optedOut?: boolean;
  sendPush: SendPushFn;
  pushId?: string;
  metadata?: Record<string, unknown>;
};

type EventMeta = {
  pushId?: string | null;
  deepLink?: string | null;
  chargeId?: string | null;
  [key: string]: unknown;
};

const experimentDefinition = experimentsConfig[EXPERIMENT_KEY] ?? {
  allocation_percent: { A: 50, B: 50 },
};

function isExperimentActive(date = new Date()): boolean {
  const { start, end } = experimentDefinition;
  const nowMs = date.getTime();
  if (start && Number.isFinite(Date.parse(start))) {
    if (nowMs < Date.parse(start)) return false;
  }
  if (end && Number.isFinite(Date.parse(end))) {
    if (nowMs > Date.parse(end)) return false;
  }
  return true;
}

function selectVariant(userId: string): string {
  const allocations = experimentDefinition.allocation_percent ?? { A: 50, B: 50 };
  const entries = Object.entries(allocations);
  if (!entries.length) return 'A';
  const total = entries.reduce((sum, [, value]) => sum + Number(value || 0), 0) || 100;
  const hash = stableHash(`${EXPERIMENT_KEY}:${userId}`);
  const target = hash % total;
  let cumulative = 0;
  for (const [variant, percent] of entries) {
    cumulative += Number(percent || 0);
    if (target < cumulative) {
      return variant;
    }
  }
  return entries[entries.length - 1][0];
}

function getLocalTimeBucket(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'overnight';
}

function eventPayload(
  userId: string,
  variant: string,
  metadata: EventMeta = {},
  date = new Date(),
) {
  return {
    experiment: EXPERIMENT_KEY,
    variant,
    user_id: userId,
    platform: Platform.OS,
    segment_variant: variant,
    segment_platform: Platform.OS,
    segment_local_time_bucket: getLocalTimeBucket(date),
    ...metadata,
  };
}

function logEvent(
  type: 'push_sent' | 'push_open' | 'deep_link_open' | 'quick_checkout_initiated',
  userId: string,
  variant: string,
  metadata: EventMeta = {},
) {
  trackEvent(`drop_push_${type}`, eventPayload(userId, variant, metadata));
}

function storageKey(userId: string, date = new Date()): string {
  const day = date.toISOString().split('T')[0];
  return `${STORAGE_PREFIX}:${userId}:${day}`;
}

async function getDailyCount(userId: string, date = new Date()): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, date));
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

async function incrementDailyCount(userId: string, date = new Date()): Promise<number> {
  const count = await getDailyCount(userId, date);
  const next = count + 1;
  try {
    await AsyncStorage.setItem(storageKey(userId, date), String(next));
  } catch {
    // ignore persistence issue; still return incremented value
  }
  return next;
}

export async function maybeSendEphemeralDropPush({
  userId,
  optedOut = false,
  sendPush,
  pushId,
  metadata = {},
}: MaybeSendOptions): Promise<{
  sent: boolean;
  reason?: 'missing_user' | 'opted_out' | 'inactive_window' | 'daily_cap';
  variant?: string;
}> {
  if (!userId) {
    return { sent: false, reason: 'missing_user' };
  }
  if (optedOut) {
    return { sent: false, reason: 'opted_out' };
  }
  if (!isExperimentActive()) {
    return { sent: false, reason: 'inactive_window' };
  }
  const variant = selectVariant(userId);
  const count = await getDailyCount(userId);
  if (count >= DAILY_CAP) {
    return { sent: false, reason: 'daily_cap', variant };
  }
  await Promise.resolve(sendPush({ variant, experiment: EXPERIMENT_KEY }));
  const updated = await incrementDailyCount(userId);
  logEvent('push_sent', userId, variant, { push_id: pushId ?? null, count_today: updated, ...metadata });
  return { sent: true, variant };
}

export function handleEphemeralDropPushOpen(
  userId: string,
  metadata: EventMeta = {},
) {
  if (!userId) return;
  const variant = selectVariant(userId);
  logEvent('push_open', userId, variant, metadata);
}

export function handleEphemeralDeepLinkOpen(
  userId: string,
  deepLink: string,
  metadata: EventMeta = {},
) {
  if (!userId) return;
  const variant = selectVariant(userId);
  logEvent('deep_link_open', userId, variant, { deep_link: deepLink, ...metadata });
}

export function notifyQuickCheckoutInitiated(
  userId: string,
  chargeId: string | null,
  metadata: EventMeta = {},
) {
  if (!userId) return;
  const variant = selectVariant(userId);
  logEvent('quick_checkout_initiated', userId, variant, {
    charge_id: chargeId ?? null,
    ...metadata,
  });
}
