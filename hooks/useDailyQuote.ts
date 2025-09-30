import * as React from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DAILY_QUOTE_ENABLED } from '@/constants/featureFlags';
import * as logger from '@/shared/logger';
import { useTranslation } from '@/contexts/I18nContext';
import { trackEvent } from '@/helpers/analytics';
import { shouldShowDailyQuote } from '@/helpers/dailyQuote';
import { generateQuote } from '@/helpers/quoteGenerator';
import { getLocalDateKey } from '@/helpers/date';

export default function useDailyQuote() {
  const { t } = useTranslation();
  const lastAppState = React.useRef<AppStateStatus>(AppState.currentState);
  const shownThisSession = React.useRef(false);

  React.useEffect(() => {
    // Avoid popping alert boxes when running unit tests
    if (process.env.JEST_WORKER_ID) return;

    const maybeShowQuote = async () => {
      try {
        const enabled = (await AsyncStorage.getItem('dailyQuote')) === 'true';
        // Only show once per calendar day; delegate decision to pure helper
        const today = getLocalDateKey();
        const lastShown = (await AsyncStorage.getItem('dailyQuote.lastShown')) || '';
        const shouldShow = shouldShowDailyQuote({
          featureFlagEnabled: DAILY_QUOTE_ENABLED,
          userEnabled: enabled,
          lastShownDate: lastShown,
          today,
          shownThisSession: shownThisSession.current,
          platform: Platform.OS,
          allowOnWeb: true,
        });
        if (!shouldShow) return;

        const style = (await AsyncStorage.getItem('dailyQuote.style')) || 'uplifting';
        const byStyle = (t(`dailyQuote.quotesByStyle.${style}`, {
          returnObjects: true,
        }) as string[]) || [];
        const fallbackQuotes = (t('dailyQuote.quotes', {
          returnObjects: true,
        }) as string[]) || [];
        const curated = byStyle.length ? byStyle : fallbackQuotes;

        // Hybrid selection: prefer generated for variety; show curated sometimes
        let q: string | null = null;
        let source: 'generated' | 'curated' | 'fallback' = 'generated';
        const preferGenerated = (curated?.length || 0) < 500 || Math.random() < 0.8;
        if (preferGenerated) {
          q = generateQuote(t as any);
          source = q ? 'generated' : 'fallback';
        }
        if (!q) {
          const pool = curated?.length ? curated : ['Believe in yourself!'];
          q = pool[Math.floor(Math.random() * pool.length)];
          source = curated?.length ? 'curated' : 'fallback';
        }
        // Persist for Home banner to read and display non-blocking
        await AsyncStorage.setItem('dailyQuote.textForToday', q);
        await AsyncStorage.setItem('dailyQuote.lastShown', today);
        await AsyncStorage.setItem('dailyQuote.sourceForToday', source);
        shownThisSession.current = true;

        // Lightweight analytics event (guarded by user preference)
        try {
          const optOut = await AsyncStorage.getItem('analyticsOptOut');
          if (optOut !== 'true') {
            trackEvent('quote_shown', { style, source });
          }
        } catch {
          // Non-fatal; ignore
        }
      } catch (err) {
        logger.warn('Failed to load daily quote', err);
      }
    };

    // Show when app becomes active to avoid interrupting transitions
    const onChange = (state: AppStateStatus) => {
      if (lastAppState.current !== 'active' && state === 'active') {
        void maybeShowQuote();
      }
      lastAppState.current = state;
    };

    const sub = AppState.addEventListener('change', onChange);
    // Also attempt once on mount
    void maybeShowQuote();
    return () => sub.remove();
  }, [t]);
}
