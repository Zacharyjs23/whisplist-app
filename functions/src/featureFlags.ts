import { config as functionsConfig, https } from 'firebase-functions/v1';

type RuntimeConfig = Record<string, any>;

function safeConfig(): RuntimeConfig {
  try {
    if (typeof functionsConfig === 'function') {
      return functionsConfig() ?? {};
    }
    return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('functions.config() is no longer available')) {
      return {};
    }
    throw error;
  }
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  }
  return false;
}

function parseAllowlist(value: unknown): Set<string> {
  if (typeof value !== 'string') {
    return new Set();
  }
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function buildAllowlist(): Set<string> {
  const config = safeConfig();
  const allowlist = new Set<string>();
  const fromConfig = parseAllowlist(config?.features?.dev_allowlist);
  const fromEnv = parseAllowlist(process.env.FEATURE_DEV_ALLOWLIST);
  const fromExpoEnv = parseAllowlist(
    process.env.EXPO_PUBLIC_FEATURE_DEV_ALLOWLIST,
  );

  for (const entry of fromConfig) allowlist.add(entry);
  for (const entry of fromEnv) allowlist.add(entry);
  for (const entry of fromExpoEnv) allowlist.add(entry);

  return allowlist;
}

function readGiftPotFlag(): boolean {
  const config = safeConfig();
  const fromConfig =
    parseBooleanFlag(config?.features?.gift_pot) ||
    parseBooleanFlag(config?.features?.split_pay);
  if (fromConfig) {
    return true;
  }
  if (parseBooleanFlag(process.env.FEATURE_GIFT_POT)) return true;
  if (parseBooleanFlag(process.env.FEATURE_SPLIT_PAY)) return true;
  if (parseBooleanFlag(process.env.EXPO_PUBLIC_FEATURE_SPLIT_PAY)) return true;
  return false;
}

export function isGiftPotEnabledForUser(userId?: string | null): boolean {
  const allowlist = buildAllowlist();
  if (userId && allowlist.has(userId)) {
    return true;
  }
  return readGiftPotFlag();
}

export function assertGiftPotEnabled(userId?: string | null): void {
  if (isGiftPotEnabledForUser(userId)) return;
  const { HttpsError } = https;
  throw new HttpsError(
    'failed-precondition',
    'Gift pot is not enabled for this project',
  );
}

export function getGiftPotDebugState(): {
  enabled: boolean;
  allowlist: string[];
} {
  const allowlist = buildAllowlist();
  return {
    enabled: readGiftPotFlag(),
    allowlist: Array.from(allowlist.values()),
  };
}
