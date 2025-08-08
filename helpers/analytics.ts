import { logEvent } from 'firebase/analytics';
import { analytics } from '@/firebase';
import * as logger from './logger';

export function trackEvent(name: string, params?: Record<string, any>) {
  try {
    if (analytics) {
      logEvent(analytics, name, params);
    } else {
      logger.warn('Analytics not ready');
    }
  } catch (err) {
    logger.warn('Failed to log analytics event:', err);
  }
}
