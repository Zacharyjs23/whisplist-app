import { logEvent } from 'firebase/analytics';
import { analytics, auth } from '@/firebase';
import * as logger from '../shared/logger';

export function trackEvent(name: string, params?: Record<string, any>) {
  try {
    if (analytics) {
      logEvent(analytics, name, params);
    } else {
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
