import { trackEvent } from '@/helpers/analytics';
import { ANALYTICS_EVENTS } from './analytics/events';

export type GiftVariant = 'venmo' | 'stripe';

export type GiftAnalyticsPayload = {
  wishId: string;
  amount: number;
  variant: GiftVariant;
  userId?: string | null;
};

type GiftAnalyticsEvent =
  | 'gift_cta_tap'
  | 'venmo_open'
  | 'return_success'
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

export function logVenmoOpen(payload: GiftAnalyticsPayload) {
  logGiftEvent('venmo_open', payload);
}

export function logReturnSuccess(payload: GiftAnalyticsPayload) {
  logGiftEvent('return_success', payload);
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
