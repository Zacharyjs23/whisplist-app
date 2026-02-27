import { trackEvent } from '@/helpers/analytics';
import { ANALYTICS_EVENTS } from './analytics/events';

export type GiftVariant = 'whisppay' | 'stripe';

export type GiftAnalyticsPayload = {
  wishId: string;
  amount: number;
  variant: GiftVariant;
  userId?: string | null;
};

type GiftAnalyticsEvent =
  | 'gift_cta_tap'
  | 'quickpay_open'
  | 'gift_returned'
  | 'gift_verification_pending'
  | 'gift_confirmed'
  | 'gift_cancel';

function normalizePayload(payload: GiftAnalyticsPayload) {
  const amount = Number.isFinite(payload.amount) ? Number(payload.amount) : 0;
  return {
    wishId: payload.wishId,
    amount,
    variant: payload.variant,
    userId: payload.userId ?? null,
  };
}

function logGiftEvent(name: GiftAnalyticsEvent, payload: GiftAnalyticsPayload) {
  trackEvent(name, normalizePayload(payload));
}

export function logGiftCtaTap(payload: GiftAnalyticsPayload) {
  logGiftEvent('gift_cta_tap', payload);
}

export function logQuickPayOpen(payload: GiftAnalyticsPayload) {
  logGiftEvent('quickpay_open', payload);
}

export function logGiftReturned(payload: GiftAnalyticsPayload) {
  logGiftEvent('gift_returned', payload);
}

export function logGiftVerificationPending(payload: GiftAnalyticsPayload) {
  logGiftEvent('gift_verification_pending', payload);
}

export function logGiftConfirmed(payload: GiftAnalyticsPayload) {
  logGiftEvent('gift_confirmed', payload);
}

export function logGiftCancel(payload: GiftAnalyticsPayload) {
  logGiftEvent('gift_cancel', payload);
}

export type SplitPayAnalyticsPayload = {
  wishId: string;
  amount?: number;
  pledgeId?: string;
  experiment?: string | null;
  status?: string;
};

function normalizeSplitPayPayload(payload: SplitPayAnalyticsPayload) {
  const amount = Number.isFinite(payload.amount)
    ? Number(payload.amount)
    : undefined;
  return {
    wishId: payload.wishId,
    amount,
    pledgeId: payload.pledgeId ?? null,
    experiment: payload.experiment ?? null,
    status: payload.status ?? null,
  };
}

export function logSplitPayView(payload: SplitPayAnalyticsPayload) {
  trackEvent(ANALYTICS_EVENTS.WISH_VIEW, normalizeSplitPayPayload(payload));
}

export function logChipInOpen(payload: SplitPayAnalyticsPayload) {
  trackEvent(ANALYTICS_EVENTS.CHIP_IN_OPEN, normalizeSplitPayPayload(payload));
}

export function logChipInAmountSelect(
  payload: SplitPayAnalyticsPayload & { preset?: boolean },
) {
  const normalized = normalizeSplitPayPayload(payload);
  trackEvent(ANALYTICS_EVENTS.CHIP_IN_AMOUNT_SELECT, {
    ...normalized,
    preset: payload.preset ?? false,
  });
}

export function logPledgeCreatedEvent(payload: SplitPayAnalyticsPayload) {
  trackEvent(
    ANALYTICS_EVENTS.PLEDGE_CREATED,
    normalizeSplitPayPayload(payload),
  );
}

export function logPledgeConfirmedEvent(payload: SplitPayAnalyticsPayload) {
  trackEvent(
    ANALYTICS_EVENTS.PLEDGE_CONFIRMED,
    normalizeSplitPayPayload(payload),
  );
}

export function logPledgeFailedEvent(
  payload: SplitPayAnalyticsPayload & { reason?: string },
) {
  trackEvent(ANALYTICS_EVENTS.PLEDGE_FAILED, {
    ...normalizeSplitPayPayload(payload),
    reason: payload.reason ?? null,
  });
}

export function logSplitPayShareClick(payload: SplitPayAnalyticsPayload) {
  trackEvent(ANALYTICS_EVENTS.SHARE_CLICK, normalizeSplitPayPayload(payload));
}

export type CampaignShareAnalyticsPayload = {
  wishId: string;
  surface: 'feed' | 'wish_detail' | 'wish_card' | 'boost';
  withSplitPay?: boolean;
};

export function logCampaignShareStart(payload: CampaignShareAnalyticsPayload) {
  trackEvent(ANALYTICS_EVENTS.CAMPAIGN_SHARE_START, {
    wishId: payload.wishId,
    surface: payload.surface,
    withSplitPay: payload.withSplitPay ?? false,
  });
}

export function logCampaignShareComplete(
  payload: CampaignShareAnalyticsPayload,
) {
  trackEvent(ANALYTICS_EVENTS.CAMPAIGN_SHARE_COMPLETE, {
    wishId: payload.wishId,
    surface: payload.surface,
    withSplitPay: payload.withSplitPay ?? false,
  });
}

export function logCampaignShareDismissed(
  payload: CampaignShareAnalyticsPayload,
) {
  trackEvent(ANALYTICS_EVENTS.CAMPAIGN_SHARE_DISMISSED, {
    wishId: payload.wishId,
    surface: payload.surface,
    withSplitPay: payload.withSplitPay ?? false,
  });
}

export type FeedVideoAnalyticsPayload = {
  event:
    | 'impression'
    | 'play'
    | 'pause'
    | 'progress_3s'
    | 'progress_10s'
    | 'progress_25'
    | 'progress_50'
    | 'progress_75'
    | 'complete'
    | 'error';
  wishId: string;
  source?: string | null;
  positionSeconds?: number;
  durationSeconds?: number;
};

const FEED_VIDEO_EVENT_MAP: Record<
  FeedVideoAnalyticsPayload['event'],
  string
> = {
  impression: ANALYTICS_EVENTS.FEED_VIDEO_IMPRESSION,
  play: ANALYTICS_EVENTS.FEED_VIDEO_PLAY,
  pause: ANALYTICS_EVENTS.FEED_VIDEO_PAUSE,
  progress_3s: ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS,
  progress_10s: ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS,
  progress_25: ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS,
  progress_50: ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS,
  progress_75: ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS,
  complete: ANALYTICS_EVENTS.FEED_VIDEO_COMPLETE,
  error: ANALYTICS_EVENTS.FEED_VIDEO_ERROR,
};

export function logFeedVideoEvent(payload: FeedVideoAnalyticsPayload) {
  const eventName = FEED_VIDEO_EVENT_MAP[payload.event];
  const params: Record<string, unknown> = {
    wishId: payload.wishId,
    source: payload.source ?? null,
  };
  if (typeof payload.positionSeconds === 'number') {
    params.positionSeconds = Number(payload.positionSeconds.toFixed(2));
  }
  if (typeof payload.durationSeconds === 'number') {
    params.durationSeconds = Number(payload.durationSeconds.toFixed(2));
  }
  if (eventName === ANALYTICS_EVENTS.FEED_VIDEO_PROGRESS) {
    params.milestone = payload.event;
  }
  trackEvent(eventName, params);
}
