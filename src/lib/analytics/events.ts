export const ANALYTICS_EVENTS = {
  WISH_VIEW: 'wish_view',
  CHIP_IN_OPEN: 'chipin_open',
  CHIP_IN_AMOUNT_SELECT: 'chipin_amount_select',
  PLEDGE_CREATED: 'pledge_created',
  PLEDGE_CONFIRMED: 'pledge_confirmed',
  PLEDGE_FAILED: 'pledge_failed',
  SHARE_CLICK: 'share_click',
  FUNDING_COMPLETED: 'funding_completed',
  DEADLINE_PASSED: 'deadline_passed',
  CAPTURE_FAILED: 'capture_failed',
  REFUND_ISSUED: 'refund_issued',
} as const;

export type AnalyticsEventKey = keyof typeof ANALYTICS_EVENTS;
