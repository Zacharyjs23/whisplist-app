import { logEvent } from 'firebase/analytics';
import { analytics, auth } from '@/firebase';
import * as logger from '../shared/logger';

export function trackEvent(name: string, params?: Record<string, unknown>) {
  try {
    if (analytics) {
      // Log whenever analytics is available (tests stub this as needed).
      logEvent(analytics, name, params);
    } else {
      // Surface a lightweight warning so callers know analytics isn't wired.
      logger.warn('Analytics not ready', {
        userId: auth.currentUser?.uid,
        severity: 'warning',
      });
    }
  } catch (err) {
    logger.warn('Failed to log analytics event:', err, {
      userId: auth.currentUser?.uid,
      severity: 'error',
    });
  }
}
