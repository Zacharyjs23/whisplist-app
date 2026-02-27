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
  FEED_VIDEO_IMPRESSION: 'feed_video_impression',
  FEED_VIDEO_PLAY: 'feed_video_play',
  FEED_VIDEO_PAUSE: 'feed_video_pause',
  FEED_VIDEO_PROGRESS: 'feed_video_progress',
  FEED_VIDEO_COMPLETE: 'feed_video_complete',
  FEED_VIDEO_ERROR: 'feed_video_error',
  CAMPAIGN_SHARE_START: 'campaign_share_start',
  CAMPAIGN_SHARE_COMPLETE: 'campaign_share_complete',
  CAMPAIGN_SHARE_DISMISSED: 'campaign_share_dismissed',
} as const;

export type AnalyticsEventKey = keyof typeof ANALYTICS_EVENTS;
