import * as Analytics from 'expo-firebase-analytics';

export function trackEvent(name: string, params?: Record<string, any>) {
  Analytics.logEvent(name, params);
}
