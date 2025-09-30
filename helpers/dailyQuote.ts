export type PlatformName = 'ios' | 'android' | 'web' | string;

export interface ShowQuoteOptions {
  featureFlagEnabled: boolean;
  userEnabled: boolean;
  lastShownDate: string | null | undefined; // YYYY-MM-DD
  today: string; // YYYY-MM-DD
  shownThisSession: boolean;
  platform: PlatformName;
  allowOnWeb?: boolean; // default: false
}

/**
 * Returns true if the daily quote should be generated/shown today.
 * Pure function to enable unit testing of edge cases.
 */
export function shouldShowDailyQuote({
  featureFlagEnabled,
  userEnabled,
  lastShownDate,
  today,
  shownThisSession,
  platform,
  allowOnWeb = false,
}: ShowQuoteOptions): boolean {
  if (!featureFlagEnabled) return false;
  if (!userEnabled) return false;
  if (shownThisSession) return false;
  if (!allowOnWeb && platform === 'web') return false;
  if ((lastShownDate || '') === today) return false;
  return true;
}

