import { logEvent } from 'firebase/analytics';
import { analytics } from '../firebase';

export function trackEvent(name: string, params?: Record<string, any>) {
  if (analytics) {
    logEvent(analytics, name, params);
  } else {
    console.warn('Analytics not ready');
  }
}
