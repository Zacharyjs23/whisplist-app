import { getRemoteConfig, getValue } from 'firebase/remote-config';
import { app } from '@/firebase';

const rc = getRemoteConfig(app);
rc.settings = {
  minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000,
  fetchTimeoutMillis: __DEV__ ? 5_000 : 30_000,
};
rc.defaultConfig = {
  'features.microList': false,
  'features.anonFav': false,
  'features.giftPot': false,
  'features.devAllowlist': '',
  'rollout.anonFav.abBucket': '0',
  'rollout.anonFav.salt': '',
};

export const isFeatureOn = (key: string): boolean => {
  try {
    return getValue(rc, key).asBoolean();
  } catch {
    return false;
  }
};

export const getRolloutPercent = (key: string): number => {
  try {
    return Number.parseInt(getValue(rc, key).asString() || '0', 10);
  } catch {
    return 0;
  }
};

export const getStringValue = (key: string): string => {
  try {
    return getValue(rc, key).asString() ?? '';
  } catch {
    return '';
  }
};
