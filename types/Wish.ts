import type { Timestamp } from 'firebase/firestore';
import type { WishStage } from './WishStage';
import type { WishScope } from './WishScope';

export type ReactionType = 'heart' | 'lightbulb' | 'hug' | 'pray';

export type Wish<
  Extra extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  text: string;
  category: string;
  /**
   * Type of post (e.g. "celebration", "goal", "struggle", "advice")
   */
  type?: string;
  likes: number;
  userId?: string;
  displayName?: string;
  photoURL?: string;
  isAnonymous?: boolean;
  /**
   * Visibility and identity scope for the wish.
   */
  scope?: WishScope;
  boostedUntil?: Timestamp | null;
  boosted?: string;
  audioUrl?: string;
  imageUrl?: string;
  giftLink?: string;
  /**
   * Type of external gift link (e.g. 'kofi', 'paypal')
   */
  giftType?: string;
  /**
   * Label shown on gift button
   */
  giftLabel?: string;
  /**
   * Link provided by a user after fulfilling the wish
   */
  fulfillmentLink?: string;
  fulfilledAt?: Timestamp | null;
  fundingGoal?: number;
  fundingCurrency?: string;
  fundingPresets?: number[];
  /**
   * Aggregated amount raised toward the goal
   */
  fundingRaised?: number;
  /**
   * Number of completed contributions
   */
  fundingSupporters?: number;
  splitPayEnabled?: boolean;
  targetAmount?: number;
  fundedAmount?: number;
  deadline?: Timestamp | null;
  status?: 'open' | 'funding' | 'fulfilled' | 'expired';
  isPoll?: boolean;
  optionA?: string;
  optionB?: string;
  votesA?: number;
  votesB?: number;
  /**
   * Optional mood emoji used for styling
   */
  mood?: string;
  /**
   * Cached number of comments for quick display.
   */
  commentCount?: number;
  /**
   * Emoji reaction counts
   */
  reactions?: Partial<Record<ReactionType, number>>;
  /**
   * Timestamp when this wish should disappear
   */
  expiresAt?: Timestamp | null;
  /**
   * Timestamp when this wish was created
   */
  timestamp?: Timestamp | null;
  /**
   * Whether this wish is marked as active
   */
  active?: boolean;
  /**
   * Progress stage of the wish lifecycle.
   */
  stage?: WishStage;
  /**
   * Timestamp when the stage last changed.
   */
  stageUpdatedAt?: Timestamp | null;
  /**
   * Optional accountability circle identifier assigned by the creator.
   */
  accountabilityCircleId?: string | null;
  /**
   * Cached name of the accountability circle for quick display.
   */
  accountabilityCircleName?: string | null;
  /**
   * Optional support request metadata (display-only, no direct payments)
   */
  supportRequest?: {
    amount?: number;
    reason?: string;
  } | null;
  /**
   * AI-detected mood label for thematic styling.
   */
  detectedMood?: string | null;
  /**
   * Optional list of tags or keywords tied to this wish.
   */
  tags?: string[];
  /**
   * Cached transcript from voice input (if any).
   */
  voiceTranscription?: string | null;
  /**
   * Optional AI-enriched variant of the wish copy.
   */
  aiRefinedText?: string | null;
} & Extra;
