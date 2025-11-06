const parseBooleanFlag = (
  raw: string | undefined,
  fallback: boolean,
): boolean => {
  if (raw === undefined || raw === null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'y', 'yes', 'on', 'enabled'].includes(normalized);
};

const parseNumber = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const featureDefaults = {
  wishMatcher: true,
  giftTogether: true,
  moodDetection: false,
  echoThreads: false,
  developerAnalytics: true,
  smartDiscovery: false,
  creatorTiers: false,
  voiceAi: false,
  microInteractions: false,
  offlineResilience: false,
} as const;

export const appConfig = {
  features: {
    wishMatcher: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_WISH_MATCHER,
      featureDefaults.wishMatcher,
    ),
    giftTogether: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_GIFT_TOGETHER,
      featureDefaults.giftTogether,
    ),
    moodDetection: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_MOOD_DETECTION,
      featureDefaults.moodDetection,
    ),
    echoThreads: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_ECHO_THREADS,
      featureDefaults.echoThreads,
    ),
    developerAnalytics: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_DEVELOPER_ANALYTICS,
      featureDefaults.developerAnalytics,
    ),
    smartDiscovery: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_SMART_DISCOVERY,
      featureDefaults.smartDiscovery,
    ),
    creatorTiers: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_CREATOR_TIERS,
      featureDefaults.creatorTiers,
    ),
    voiceAi: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_VOICE_AI,
      featureDefaults.voiceAi,
    ),
    microInteractions: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_MICRO_INTERACTIONS,
      featureDefaults.microInteractions,
    ),
    offlineResilience: parseBooleanFlag(
      process.env.EXPO_PUBLIC_FEATURE_OFFLINE_RESILIENCE,
      featureDefaults.offlineResilience,
    ),
  },
  wishMatcher: {
    cacheTtlMs: parseNumber(
      process.env.EXPO_PUBLIC_WISH_MATCHER_TTL_MS,
      6 * 60 * 60 * 1000,
    ),
  },
} as const;

export type AppFeatureKey = keyof typeof appConfig.features;

export const isFeatureEnabled = (key: AppFeatureKey): boolean =>
  appConfig.features[key];
