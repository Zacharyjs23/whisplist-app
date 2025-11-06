import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as logger from '@/shared/logger';
import {
  scheduleCircleReminder,
  cancelCircleReminder,
} from '@/helpers/reminders';
import { trackEvent } from '@/helpers/analytics';

export type AccountabilityCircle = {
  id: string;
  name: string;
  cadenceDays: number;
  createdAt: number;
  lastCheckInAt?: number;
  memberHint?: string;
  reminderNotificationId?: string | null;
  nextReminderAt?: number | null;
};

const STORAGE_KEY = 'accountability.circles.v1';

const generateId = () =>
  `circle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const withReminderDefaults = (
  circle: AccountabilityCircle,
): AccountabilityCircle => ({
  ...circle,
  reminderNotificationId: circle.reminderNotificationId ?? null,
  nextReminderAt:
    typeof circle.nextReminderAt === 'number' ? circle.nextReminderAt : null,
});

export const useAccountabilityCircles = () => {
  const [circles, setCircles] = useState<AccountabilityCircle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!mounted) return;
        if (!raw) {
          setCircles([]);
        } else {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setCircles(
              parsed.map((circle) =>
                withReminderDefaults(circle as AccountabilityCircle),
              ),
            );
          } else {
            setCircles([]);
          }
        }
      } catch (err) {
        logger.warn('Failed to load accountability circles', err);
        setCircles([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: AccountabilityCircle[]) => {
    const normalized = next.map(withReminderDefaults);
    setCircles(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch (err) {
      logger.warn('Failed to persist accountability circles', err);
    }
  }, []);

  const createCircle = useCallback(
    async (name: string, cadenceDays = 3, memberHint?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const circle: AccountabilityCircle = {
        id: generateId(),
        name: trimmed,
        cadenceDays: Math.max(1, cadenceDays),
        createdAt: Date.now(),
        ...(memberHint ? { memberHint: memberHint.trim() } : {}),
      };
      let reminderHandle = null;
      try {
        reminderHandle = await scheduleCircleReminder({
          circleId: circle.id,
          name: circle.name,
          cadenceDays: circle.cadenceDays,
        });
      } catch (err) {
        logger.warn('Failed to prime circle reminder', err, {
          circleId: circle.id,
        });
      }
      const enriched: AccountabilityCircle = {
        ...circle,
        reminderNotificationId: reminderHandle?.id ?? null,
        nextReminderAt: reminderHandle?.triggerAt ?? null,
      };
      await persist([enriched, ...circles]);
      try {
        trackEvent('accountability_circle_created', {
          cadence_days: enriched.cadenceDays,
          has_hint: !!enriched.memberHint,
        });
      } catch {}
      return enriched;
    },
    [circles, persist],
  );

  const updateCircle = useCallback(
    async (
      id: string,
      updates: Partial<AccountabilityCircle>,
      options: { forceReschedule?: boolean } = {},
    ) => {
      const existing = circles.find((circle) => circle.id === id);
      if (!existing) return;

      const sanitized: Partial<AccountabilityCircle> = { ...updates };
      if (typeof sanitized.name === 'string') {
        sanitized.name = sanitized.name.trim();
        if (!sanitized.name) {
          sanitized.name = existing.name;
        }
      }
      if (typeof sanitized.cadenceDays === 'number') {
        sanitized.cadenceDays = Math.max(1, Math.round(sanitized.cadenceDays));
      }

      let reminderNotificationId =
        sanitized.reminderNotificationId ??
        existing.reminderNotificationId ??
        null;
      let nextReminderAt =
        sanitized.nextReminderAt ?? existing.nextReminderAt ?? null;

      const cadenceChanged =
        typeof sanitized.cadenceDays === 'number' &&
        sanitized.cadenceDays !== existing.cadenceDays;
      const nameChanged =
        typeof sanitized.name === 'string' && sanitized.name !== existing.name;
      const shouldReschedule =
        options.forceReschedule || cadenceChanged || nameChanged;

      if (shouldReschedule) {
        await cancelCircleReminder(existing.reminderNotificationId);
        try {
          const handle = await scheduleCircleReminder({
            circleId: existing.id,
            name: sanitized.name ?? existing.name,
            cadenceDays: sanitized.cadenceDays ?? existing.cadenceDays,
          });
          reminderNotificationId = handle?.id ?? null;
          nextReminderAt = handle?.triggerAt ?? null;
        } catch (err) {
          logger.warn('Failed to reschedule circle reminder', err, {
            circleId: existing.id,
          });
          reminderNotificationId = null;
          nextReminderAt = null;
        }
      }

      const next = circles.map((circle) => {
        if (circle.id !== id) return circle;
        return withReminderDefaults({
          ...circle,
          ...sanitized,
          reminderNotificationId,
          nextReminderAt,
        });
      });
      await persist(next);
    },
    [circles, persist],
  );

  const deleteCircle = useCallback(
    async (id: string) => {
      const target = circles.find((circle) => circle.id === id);
      if (target?.reminderNotificationId) {
        await cancelCircleReminder(target.reminderNotificationId);
      }
      const next = circles.filter((circle) => circle.id !== id);
      await persist(next);
    },
    [circles, persist],
  );

  const recordCheckIn = useCallback(
    async (id: string) => {
      const found = circles.find((circle) => circle.id === id);
      if (!found) return;
      const now = Date.now();
      await updateCircle(id, { lastCheckInAt: now }, { forceReschedule: true });
    },
    [circles, updateCircle],
  );

  const byId = useMemo(() => {
    const map: Record<string, AccountabilityCircle> = {};
    circles.forEach((circle) => {
      map[circle.id] = circle;
    });
    return map;
  }, [circles]);

  return {
    circles,
    circlesById: byId,
    loading,
    createCircle,
    recordCheckIn,
    updateCircle,
    deleteCircle,
  };
};

export type UseAccountabilityCirclesReturn = ReturnType<
  typeof useAccountabilityCircles
>;
