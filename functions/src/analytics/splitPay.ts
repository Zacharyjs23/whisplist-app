import * as functions from 'firebase-functions/v1';

export type SplitPayEvent =
  | 'pledge_created'
  | 'pledge_capture_success'
  | 'pledge_capture_failed'
  | 'pledge_canceled'
  | 'wish_fulfilled'
  | 'wish_expired';

export type SplitPayAnalyticsPayload = {
  wishId: string;
  pledgeId?: string;
  userId?: string | null;
  amount?: number;
  status?: string;
  trigger?: string;
  reason?: string;
};

export function logSplitPayEvent(
  event: SplitPayEvent,
  payload: SplitPayAnalyticsPayload,
) {
  functions.logger.info(`splitpay:${event}`, payload);
}

export function logPledgeCreated(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('pledge_created', payload);
}

export function logPledgeCaptureSuccess(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('pledge_capture_success', payload);
}

export function logPledgeCaptureFailed(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('pledge_capture_failed', payload);
}

export function logPledgeCanceled(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('pledge_canceled', payload);
}

export function logWishFulfilled(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('wish_fulfilled', payload);
}

export function logWishExpired(payload: SplitPayAnalyticsPayload) {
  logSplitPayEvent('wish_expired', payload);
}
