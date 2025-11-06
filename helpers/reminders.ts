import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as logger from '@/shared/logger';
import { DEFAULT_WISH_STAGE, type WishStage } from '@/types/WishStage';

const stageOffsetsHours: Record<WishStage, number> = {
  seed: 12,
  shared: 24,
  nurturing: 48,
  celebrating: 72,
};

const HOURS_TO_SECONDS = 3600;

export type CircleReminderHandle = {
  id: string;
  triggerAt: number;
};

export const scheduleWishFollowUpReminder = async (opts: {
  stage: WishStage | undefined;
  wishId: string;
  wishText: string;
}) => {
  if (Platform.OS === 'web') return;
  const stage =
    opts.stage && stageOffsetsHours[opts.stage] != null
      ? opts.stage
      : DEFAULT_WISH_STAGE;
  const delaySeconds = stageOffsetsHours[stage] * HOURS_TO_SECONDS;
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) return;
  try {
    await ensureReminderChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to check in on your wish ✨',
        body: opts.wishText.slice(0, 90),
        data: { kind: 'wish_follow_up', wishId: opts.wishId, stage },
      },
      trigger: { seconds: delaySeconds, channelId: 'whisplist-reminders' },
    });
  } catch (err) {
    logger.warn('Failed to schedule wish reminder', err, {
      wishId: opts.wishId,
    });
  }
};

export const scheduleCircleReminder = async (opts: {
  circleId: string;
  name: string;
  cadenceDays: number;
}) => {
  if (Platform.OS === 'web') return null;
  const seconds = Math.max(
    1,
    Math.round(opts.cadenceDays * 24 * HOURS_TO_SECONDS),
  );
  try {
    await ensureReminderChannel();
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Check in: ${opts.name}`,
        body: 'Drop a quick update for your circle.',
        data: { kind: 'circle_check_in', circleId: opts.circleId },
      },
      trigger: { seconds, channelId: 'whisplist-reminders' },
    });
    const triggerAt = Date.now() + seconds * 1000;
    return { id, triggerAt } satisfies CircleReminderHandle;
  } catch (err) {
    logger.warn('Failed to schedule circle reminder', err, {
      circleId: opts.circleId,
    });
  }
  return null;
};

export const ensureReminderChannel = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('whisplist-reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (err) {
    logger.warn('Failed to configure reminder notification channel', err);
  }
};

export const cancelCircleReminder = async (notificationId?: string | null) => {
  if (!notificationId || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    logger.warn('Failed to cancel circle reminder', err, { notificationId });
  }
};
