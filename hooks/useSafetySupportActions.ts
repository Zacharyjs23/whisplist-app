import { useCallback } from 'react';
import { Linking } from 'react-native';
import { router, type Href } from 'expo-router';
import type { SafetyConfig } from '@/helpers/safety';
import { trackEvent } from '@/helpers/analytics';

const record = (event: string, payload: Record<string, unknown>) => {
  try {
    trackEvent(event, payload);
  } catch {
    // analytics failures are non-blocking
  }
};

export const useSafetySupportActions = (safetyConfig: SafetyConfig) => {
  const openResources = useCallback(() => {
    const target = safetyConfig.resourcesUri;
    if (!target) {
      record('safety_support_resources_opened', {
        target: 'support_screen',
        transport: 'internal',
      });
      router.push('/support' as Href);
      return;
    }
    if (/^https?:/i.test(target)) {
      record('safety_support_resources_opened', {
        target,
        transport: 'external',
      });
      Linking.openURL(target).catch(() => {
        record('safety_support_resources_fallback', { target });
        router.push('/support' as Href);
      });
      return;
    }
    record('safety_support_resources_opened', {
      target,
      transport: 'internal',
    });
    router.push(target as Href);
  }, [safetyConfig.resourcesUri]);

  const openEmergency = useCallback(() => {
    if (!safetyConfig.emergencyUri) return;
    record('safety_support_emergency_initiated', {
      target: safetyConfig.emergencyUri,
    });
    Linking.openURL(safetyConfig.emergencyUri).catch(() => {
      record('safety_support_emergency_failed', {
        target: safetyConfig.emergencyUri,
      });
    });
  }, [safetyConfig.emergencyUri]);

  return {
    openResources,
    openEmergency,
  };
};

export type SafetySupportHandlers = ReturnType<typeof useSafetySupportActions>;
