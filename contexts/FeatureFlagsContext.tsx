import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchAndActivate, getRemoteConfig } from 'firebase/remote-config';
import { app } from '@/firebase';
import { isFeatureOn, getRolloutPercent, getStringValue } from '@/lib/flags';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { stableHash } from '@/src/experiments/useExperiment';
import * as logger from '@/shared/logger';

type FeatureFlagState = {
  ready: boolean;
  microList: boolean;
  anonFav: boolean;
  giftPot: boolean;
  anonFavRollout: number;
  anonFavSalt: string;
  devAllowlisted: boolean;
  anonFavBucket: number;
  refresh: () => Promise<void>;
  version: number;
};

const defaultState: FeatureFlagState = {
  ready: false,
  microList: false,
  anonFav: false,
  giftPot: false,
  anonFavRollout: 0,
  anonFavSalt: '',
  devAllowlisted: false,
  anonFavBucket: 0,
  refresh: async () => {},
  version: 0,
};

const FeatureFlagsContext = createContext<FeatureFlagState>(defaultState);

function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function parseBoolean(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return (
    normalized === 'true' ||
    normalized === '1' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuthSession();
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rc = getRemoteConfig(app);
      await fetchAndActivate(rc);
      setVersion((prev) => prev + 1);
    } catch (error) {
      logger.warn('Failed to fetch remote config', error, {
        userId: user?.uid ?? undefined,
        severity: 'warning',
      });
    } finally {
      setReady(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    refresh().catch((error) => {
      logger.warn('Remote config bootstrap failed', error, {
        userId: user?.uid ?? undefined,
        severity: 'warning',
      });
      setReady(true);
    });
  }, [refresh, user?.uid]);

  const value = useMemo<FeatureFlagState>(() => {
    const allowlistRaw =
      getStringValue('features.devAllowlist') ||
      process.env.EXPO_PUBLIC_FEATURE_DEV_ALLOWLIST ||
      '';
    const allowlist = parseAllowlist(allowlistRaw);
    if (__DEV__) {
      allowlist.add('dev');
    }
    const allowlisted =
      (user?.uid && allowlist.has(user.uid)) ||
      (!!profile?.developerMode && profile.developerMode) ||
      (__DEV__ && allowlist.has('dev'));

    const microListEnabled =
      allowlisted ||
      isFeatureOn('features.microList') ||
      parseBoolean(process.env.EXPO_PUBLIC_FEATURE_MICRO_LIST);
    const giftPotEnabled =
      allowlisted ||
      isFeatureOn('features.giftPot') ||
      parseBoolean(process.env.EXPO_PUBLIC_FEATURE_SPLIT_PAY);

    const anonFavRollout = getRolloutPercent('rollout.anonFav.abBucket');
    const anonFavSalt =
      getStringValue('rollout.anonFav.salt') || process.env.ANON_SALT || '';

    const bucketSubject = user?.uid ?? 'guest';
    const bucketValue = stableHash(`anonFav:${bucketSubject}`) % 100;
    const anonFavEnabled =
      allowlisted ||
      (isFeatureOn('features.anonFav') && bucketValue < anonFavRollout);

    return {
      ready,
      microList: microListEnabled,
      anonFav: anonFavEnabled,
      giftPot: giftPotEnabled,
      anonFavRollout,
      anonFavSalt,
      devAllowlisted: allowlisted,
      anonFavBucket: bucketValue,
      refresh,
      version,
    };
  }, [profile?.developerMode, ready, refresh, user?.uid, version]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagState {
  return useContext(FeatureFlagsContext);
}
