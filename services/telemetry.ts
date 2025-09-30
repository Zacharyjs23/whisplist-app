import { postJson } from '@/services/functions';
import { auth } from '@/firebase';
import type { TelemetryMeta } from '@/shared/logger';

type LogLevel = 'log' | 'warn' | 'error';

type TelemetryPayload = {
  level: LogLevel;
  message: string;
  meta?: TelemetryMeta;
  timestamp: number;
};

export async function sendTelemetry(level: LogLevel, message: string, meta?: TelemetryMeta) {
  try {
    const payload: TelemetryPayload = {
      level,
      message,
      meta,
      timestamp: Date.now(),
    };
    const user = auth.currentUser;
    if (!user) {
      if (__DEV__) {
        console.warn('[telemetry] skipped sending log: no authenticated user');
      }
      return;
    }
    const token = await user.getIdToken();
    await postJson('logTelemetry', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    // Avoid infinite recursion by not reusing the shared logger here
    if (__DEV__) {
      console.warn('[telemetry] failed to send log', err);
    }
  }
}
