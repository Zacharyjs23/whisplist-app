import { shouldShowDailyQuote } from '@/helpers/dailyQuote';

describe('shouldShowDailyQuote', () => {
  const base = {
    featureFlagEnabled: true,
    userEnabled: true,
    lastShownDate: '',
    today: '2025-01-01',
    shownThisSession: false,
    platform: 'ios',
  } as const;

  it('returns false when feature flag disabled', () => {
    expect(
      shouldShowDailyQuote({ ...base, featureFlagEnabled: false }),
    ).toBe(false);
  });

  it('returns false when user disabled in settings', () => {
    expect(shouldShowDailyQuote({ ...base, userEnabled: false })).toBe(false);
  });

  it('returns false when already shown this session', () => {
    expect(shouldShowDailyQuote({ ...base, shownThisSession: true })).toBe(
      false,
    );
  });

  it('returns false when already shown today', () => {
    expect(
      shouldShowDailyQuote({ ...base, lastShownDate: base.today }),
    ).toBe(false);
  });

  it('returns true on iOS when eligible', () => {
    expect(shouldShowDailyQuote({ ...base, platform: 'ios' })).toBe(true);
  });

  it('returns true on Android when eligible', () => {
    expect(shouldShowDailyQuote({ ...base, platform: 'android' })).toBe(true);
  });

  it('returns false on web by default (allowOnWeb=false)', () => {
    expect(
      shouldShowDailyQuote({ ...base, platform: 'web' }),
    ).toBe(false);
  });

  it('returns true on web when allowOnWeb=true', () => {
    expect(
      shouldShowDailyQuote({ ...base, platform: 'web', allowOnWeb: true }),
    ).toBe(true);
  });

  it('returns true after date rollover', () => {
    expect(
      shouldShowDailyQuote({ ...base, lastShownDate: '2024-12-31' }),
    ).toBe(true);
  });
});

