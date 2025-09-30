import type { Timestamp } from 'firebase/firestore';

export type EngagementKind = 'posting' | 'gifting' | 'fulfillment';

export type MilestoneId =
  | 'posting_1'
  | 'posting_3'
  | 'posting_7'
  | 'posting_14'
  | 'posting_30'
  | 'gifting_1'
  | 'gifting_5'
  | 'gifting_15'
  | 'fulfillment_1'
  | 'fulfillment_3'
  | 'fulfillment_10';

export interface StreakEntry {
  current: number;
  longest: number;
  lastDate: string | null;
  milestones: Partial<Record<MilestoneId, string | true>>;
}

export interface EngagementStats {
  posting: StreakEntry;
  gifting: StreakEntry;
  fulfillment: StreakEntry;
  updatedAt?: Timestamp;
}

export interface EngagementUpdateResult {
  kind: EngagementKind;
  current: number;
  longest: number;
  unlocked: MilestoneId[];
}
